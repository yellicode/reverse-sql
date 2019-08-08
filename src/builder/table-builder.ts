import * as sql from 'mssql';
import { ColumnsSqlResult, ColumnConstraintsSqlResult } from './queries/query-interfaces';
import { SqlServerTable, SqlServerConstraint, SqlServerColumn, Table, ConstraintType } from '@yellicode/sql-server';
import * as _ from 'lodash';

export class TableBuilder {
    constructor(private tableFilter?: (schema: string, name: string) => boolean) {

    }

    public build(
        columnsRecordSet: sql.IRecordSet<ColumnsSqlResult>,
        columnConstraintsRecordSet: sql.IRecordSet<ColumnConstraintsSqlResult> | null): SqlServerTable[] {
        const tables: SqlServerTable[] = [];

        // group columns by (full, including schema) table name
        const columnRecordsByTableName = _.groupBy(columnsRecordSet, (c: ColumnsSqlResult) => `${c.TABLE_SCHEMA}_${c.TABLE_NAME}`);
        const columnConstraintsByTableName = columnConstraintsRecordSet ? _.groupBy(columnConstraintsRecordSet, (c: ColumnConstraintsSqlResult) => `${c.TABLE_SCHEMA}_${c.TABLE_NAME}`) : null;

        Object
            .keys(columnRecordsByTableName)
            .forEach(tableFullName => {
                const columnRecords = columnRecordsByTableName[tableFullName];
                if (!columnRecords.length)
                    return; // should never be the case as long as we select columns and join them with table info

                const firstRecord = columnRecords[0];
                const tableSchema = firstRecord.TABLE_SCHEMA;
                const tableName = firstRecord.TABLE_NAME;
                if (!this.shouldIncludedTable(tableSchema, tableName)) {
                    return;
                }              

                const constraintRecords: ColumnConstraintsSqlResult[] | null = columnConstraintsByTableName ? columnConstraintsByTableName[tableFullName] : null;                         
                const ownColumns: SqlServerColumn[] = [];

                const table: SqlServerTable = {
                    constraints: TableBuilder.createSqlServerConstraints(constraintRecords),
                    name: tableName,
                    schema: firstRecord.TABLE_SCHEMA,
                    isJunctionTable: false, // don't know (or check out IdentifyMappingTable at https://github.com/sjh37/EntityFramework-Reverse-POCO-Code-First-Generator/blob/3626969ee348dde1c7172a1b7f58bb5ff0d61922/EntityFramework.Reverse.POCO.Generator/EF.Reverse.POCO.Core.ttinclude#L4143
                    ownColumns: ownColumns,
                    dependentColumns: [], // TODO?
                    objectType: null
                }
                
                // Make sure that columns are sorted by ordinal position (particularly important for table types)
                columnRecords.sort((a, b) => a.ORDINAL_POSITION - b.ORDINAL_POSITION);
                columnRecords.forEach(record => {
                    ownColumns.push(TableBuilder.createSqlServerColumn(table, record, constraintRecords));
                });
                tables.push(table);
            });

        return tables;
    }
    
    private static createSqlServerColumn(table: Table, record: ColumnsSqlResult, tableConstraints: ColumnConstraintsSqlResult[] | null): SqlServerColumn {

        const isPrimaryKey =
            !!tableConstraints &&
            tableConstraints.findIndex(c => c.COLUMN_NAME === record.SPECIFIC_NAME && c.CONSTRAINT_TYPE === 'PRIMARY KEY') > -1;

        const isForeignKey =
            !!tableConstraints &&
            tableConstraints.findIndex(c => c.COLUMN_NAME === record.SPECIFIC_NAME && c.CONSTRAINT_TYPE === 'FOREIGN KEY') > -1;

        const isReadOnly =
            record.IS_IDENTITY ||
            record.IS_ROWGUID_COL ||
            record.IS_COMPUTED ||
            record.DATA_TYPE === 'rowversion' || record.DATA_TYPE === 'timestamp' ||
            (record.DATA_TYPE === 'uniqueidentifier' && !!record.COLUMN_DEFAULT && record.COLUMN_DEFAULT.indexOf('newsequentialid') > -1);
            
        return {
            name: record.SPECIFIC_NAME,
            sqlTypeName: record.DATA_TYPE,
            length: record.CHARACTER_MAXIMUM_LENGTH,
            precision: record.NUMERIC_PRECISION,
            scale: record.NUMERIC_SCALE,
            isIdentity: record.IS_IDENTITY,
            isNullable: record.IS_NULLABLE === 'YES',
            isPrimaryKey: isPrimaryKey,
            isForeignKey: isForeignKey,
            isReadOnly: isReadOnly,
            hasDefaultValue: !!record.COLUMN_DEFAULT,
            table: table,
            isNavigableInModel: false
        }
    }
    
    private static createSqlServerConstraints(tableConstraints: ColumnConstraintsSqlResult[] | null): SqlServerConstraint[] {

        const result: SqlServerConstraint[] = [];
        if (!tableConstraints)
            return result;

        tableConstraints.forEach(record => {
            let constraintType: ConstraintType;

            if (record.CONSTRAINT_TYPE === 'PRIMARY KEY')
                constraintType = ConstraintType.PrimaryKey;
            else if (record.CONSTRAINT_TYPE === 'FOREIGN KEY')
                constraintType = ConstraintType.ForeignKey;
            else
                return; // unsupported constraint

            const constraint: SqlServerConstraint = {
                constraintType: constraintType,
                name: record.CONSTRAINT_NAME,
                columnName: record.COLUMN_NAME,
                cascadeOnDelete: false, // if you need this, add INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS.DELETE_RULE to the record
                primaryKeyTableSchema: null,
                primaryKeyTableName: null,
                primaryKeyColumnName: null
            }
            if (constraintType === ConstraintType.ForeignKey) {
                constraint.primaryKeyTableSchema = record.PK_TABLE_SCHEMA;
                constraint.primaryKeyTableName = record.PK_TABLE_NAME;
                constraint.primaryKeyColumnName = record.PK_COLUMN_NAME;
            }
            result.push(constraint);
        });

        return result;
    }

    private shouldIncludedTable(schema: string, name: string): boolean {
        if (!this.tableFilter)
            return true;

        return this.tableFilter(schema, name);
    }
}