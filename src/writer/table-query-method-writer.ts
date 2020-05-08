import { NameUtility } from '@yellicode/core';
import { ParameterDefinition, MethodDefinition, CSharpWriter } from '@yellicode/csharp';

import { DbTable, DbColumn, SqlParameterDirection, SqlResultSet } from '../model/database';
import { SqlServerQuery, SqlServerParameter } from '../model/sql-server-database';

import { SqlServerParameterWithColumn } from '../builder/sql-parameter-with-column';
import { TableResultSetBuilder } from '../builder/table-result-set-builder';
import { CSharpReverseSqlTypeNameProvider } from '../mapper/csharp-reverse-sql-type-name-provider';
import { QueryMethodWriter } from './query-method-writer';
import { ReverseSqlObjectNameProvider } from '../mapper/reverse-sql-object-name-provider';
import { ReverseSqlTypeNameProvider } from '../mapper/reverse-sql-type-name-provider';

export class TableQueryMethodWriter extends QueryMethodWriter {

    constructor(csharp: CSharpWriter, objectNameProvider: ReverseSqlObjectNameProvider, private typeNameProvider: ReverseSqlTypeNameProvider, connectionStringFieldName: string) {
        super(csharp, objectNameProvider, connectionStringFieldName)

    }
    public writeTableInsertMethods(table: DbTable): void {
        const parameters: SqlServerParameterWithColumn[] = table.ownColumns
            .filter(c => !c.hasDefaultValue) // let the database handle default values
            .map((c, index) => { return this.buildSqlParameterFromColumn(c, index, true); }
            );

        const idParameter = parameters.find(c => c.isIdentity);
        const methodName = this.objectNameProvider.getTableInsertMethodName(table);
        const columns = table.ownColumns;

        // Write an overload that acceps individual parameters
        const query: SqlServerQuery = { parameters: parameters };
        this.writeExecuteQueryMethod(methodName, null, query, 'Text', true, (commandTextVariable: string, csharp: CSharpWriter) => {
            const inputParameters = parameters.filter(p => !p.isReadOnly);

            csharp.writeLine(`var ${commandTextVariable} = @"INSERT INTO [${table.schema}].[${table.name}]`);
            csharp.writeLineIndented(`(${inputParameters.map(p => `[${p.columnName}]`).join(', ')})`);

            if (idParameter) {
                csharp.writeLineIndented(`VALUES (${inputParameters.map(p => `${QueryMethodWriter.minifyParameterName(p)}`).join(', ')})`);
                csharp.writeLineIndented(`SET ${QueryMethodWriter.minifyParameterName(idParameter)} = SCOPE_IDENTITY()";`);
            }
            else csharp.writeLineIndented(`VALUES (${inputParameters.map(p => `${QueryMethodWriter.minifyParameterName(p)}`).join(', ')})";`);
        });

        // Write an overload that acceps an instance of the table class
        const tableClassName = this.objectNameProvider.getTableClassName(table);
        const tableParameterName = NameUtility.unCapitalize(tableClassName);
        const methodParameters: ParameterDefinition[] = [{ name: tableParameterName, typeName: tableClassName }];
        const methodDefinition: MethodDefinition = { name: methodName, accessModifier: 'public', parameters: methodParameters };

        this.csharp.writeLine();
        this.csharp.writeMethodBlock(methodDefinition, () => {
            if (idParameter) {
                this.csharp.writeLine(`${idParameter.objectTypeName} id;`);
            }
            this.csharp.writeIndent();
            this.csharp.write(`${methodName}(`);
            // Pass input parameters, mapped from the table class instance
            this.csharp.write(parameters
                .filter(p => p !== idParameter)
                .map(p => {
                    return `${tableParameterName}.${this.objectNameProvider.getColumnPropertyName({ name: p._column.name, ordinal: columns.indexOf(p._column) })}`;
                })
                .join(', '));

            // Pass the output parameter
            if (idParameter)
                this.csharp.write(', out id');

            this.csharp.writeEndOfLine(');');

            if (idParameter) {
                // Now assign the id parameter to the property that matches the id column
                const idPropertyName = this.objectNameProvider.getColumnPropertyName({ name: idParameter._column.name, ordinal: columns.indexOf(idParameter._column) });
                this.csharp.writeLine(`${tableParameterName}.${idPropertyName} = id;`);
            }
        });
    }

    public writeTableUpdateMethods(table: DbTable): void {
        const idColumn = table.ownColumns.find(c => c.isIdentity);
        if (!idColumn)
            return;

        const idParameter = this.buildSqlParameterFromColumn(idColumn, 0);
        const whereParameters: SqlServerParameterWithColumn[] = [idParameter];
        const indexOffset = whereParameters.length;

        const updateParameters: SqlServerParameterWithColumn[] = table.ownColumns
            // .filter(c => !c.isPrimaryKey) // same here
            .filter(c => !c.isIdentity)
            .map((c, index) => { return this.buildSqlParameterFromColumn(c, indexOffset + index); }
            );

        if (!updateParameters.length) {
            return;
        }

        // Write an overload that acceps individual parameters
        const allParameters = [...whereParameters, ...updateParameters];
        const query: SqlServerQuery = { parameters: allParameters };
        const methodName = this.objectNameProvider.getTableUpdateMethodName(table);
        this.writeExecuteQueryMethod(methodName, null, query, 'Text', true, (commandTextVariable: string, csharp: CSharpWriter) => {
            const idParameterName = this.objectNameProvider.getParameterName(idParameter);
            csharp.writeLine(`if (${idParameterName} <= 0) throw new ArgumentOutOfRangeException(nameof(${idParameterName}));`);
            csharp.writeLine();
            csharp.writeLine(`var ${commandTextVariable} = @"UPDATE [${table.schema}].[${table.name}] SET`);
            csharp.increaseIndent();
            updateParameters.forEach((p, index) => {
                csharp.writeIndent();
                csharp.write(`[${p.columnName}] = ${QueryMethodWriter.minifyParameterName(p)}`);
                if (index < updateParameters.length - 1) csharp.writeEndOfLine(',');
                else csharp.writeEndOfLine();
            });
            csharp.writeIndent();
            csharp.write('WHERE ');
            csharp.write(whereParameters.map(p => `${p.columnName} = ${QueryMethodWriter.minifyParameterName(p)}";`).join(' AND '));
            csharp.writeEndOfLine();
            csharp.decreaseIndent();
        });

        // Write an overload that acceps an instance of the table class
        const tableClassName = this.objectNameProvider.getTableClassName(table);
        const tableParameterName = NameUtility.unCapitalize(tableClassName);
        const methodParameters: ParameterDefinition[] = [{ name: tableParameterName, typeName: tableClassName }];
        const methodDefinition: MethodDefinition = { name: methodName, accessModifier: 'public', parameters: methodParameters };

        this.csharp.writeLine();
        this.csharp.writeMethodBlock(methodDefinition, () => {
            this.csharp.writeIndent();
            this.csharp.write(`${methodName}(`);
            // Pass input parameters, mapped from the table class instance
            this.csharp.write(allParameters
                .map((p, i) => {
                    return `${tableParameterName}.${this.objectNameProvider.getColumnPropertyName({ name: p._column.name, ordinal: i })}`;
                })
                .join(', '));
            this.csharp.writeEndOfLine(');');
        });
    }

    public writeTableSelectByPrimaryKeyMethod(table: DbTable): void {
        const whereParameters: SqlServerParameter[] = table.ownColumns
            .filter(c => c.isPrimaryKey)
            .map((c, index) => { return this.buildSqlParameterFromColumn(c, index); }
            );

        if (!whereParameters.length) {
            return;
        }

        const resultSet: SqlResultSet = {
                hasSingleRecord: true,
                columns: table.ownColumns.map((c, index) =>
                    TableResultSetBuilder.buildResultSetColumn(c, index, this.typeNameProvider.getColumnObjectTypeName(c.sqlTypeName, table.name, c.name))) };

        const query: SqlServerQuery = { parameters: whereParameters, resultSets: [resultSet] };

        const methodName = this.objectNameProvider.getTableSelectByPrimaryKeyMethodName(table);
        const resultSetClassName = this.objectNameProvider.getTableClassName(table);

        this.writeExecuteQueryMethod(methodName, resultSetClassName, query, 'Text', true, (commandTextVariable: string, csharp: CSharpWriter) => {
            csharp.writeIndent();
            csharp.write(`var ${commandTextVariable} = @"SELECT ${resultSet.columns.map(c => c.name).join(', ')}`);
            csharp.writeEndOfLine();
            csharp.increaseIndent();
            csharp.writeLine(`FROM [${table.schema}].[${table.name}]`);
            csharp.writeIndent();
            csharp.write('WHERE ');
            csharp.write(whereParameters.map(p => `${p.columnName} = ${QueryMethodWriter.minifyParameterName(p)}";`).join(' AND '));
            csharp.writeEndOfLine();
            csharp.decreaseIndent();
        });
    }

    public writeTableSelectByExpressionMethod(table: DbTable): void {
        // First write column mappings to a dictionary
        const tableClassName = this.objectNameProvider.getTableClassName(table);
        const mappingFieldName = `${tableClassName}ColumnMapping`;

        this.csharp.writeLine(`private static readonly Dictionary<string, string> ${mappingFieldName} = new Dictionary<string, string>() {`);
        this.csharp.increaseIndent();
        const map: string[] = table.ownColumns.map((c, i) => { return { propName: this.objectNameProvider.getColumnPropertyName({ name: c.name, ordinal: i }), colName: c.name } })
            .filter(item => item.colName !== item.propName) // when equal, we need no mapping
            .map(item => `{"${item.propName}", "${item.colName}"}`);

        map.forEach((entry, index) => {
            this.csharp.writeIndent();
            this.csharp.write(entry);
            if (index < map.length)
                this.csharp.writeEndOfLine(',');
            else this.csharp.writeEndOfLine();
        });
        this.csharp.decreaseIndent();
        this.csharp.writeLine('};');

        // Write the method
        this.csharp.writeLine();
        const resultSet: SqlResultSet = {
                hasSingleRecord: false,
                columns: table.ownColumns.map((c, index) =>
                TableResultSetBuilder.buildResultSetColumn(c, index, this.typeNameProvider.getColumnObjectTypeName(c.sqlTypeName, table.name, c.name)))
            };
        const query: SqlServerQuery = { parameters: [], resultSets: [resultSet] };

        const expressionParameter: ParameterDefinition = { name: 'expression', typeName: `System.Linq.Expressions.Expression<Func<${tableClassName}, bool>>` };
        let methodDefinition: MethodDefinition = { name: this.objectNameProvider.getTableSelectByExpressionMethodName(table), accessModifier: 'public', parameters: [expressionParameter] };

        // Because the SQL parameters are built dynamically by the WhereBuilder, we need to add them dynamicaly in the generated code
        const beforeWriteCommandParameters = (commandVariable: string, csharp: CSharpWriter): void => {
            csharp.writeLine('// Add parameters created by the WhereBuilder');
            csharp.writeLine('foreach (var parameter in wherePart.Parameters)');
            csharp.writeLineIndented(`${commandVariable}.Parameters.AddWithValue(parameter.Key, parameter.Value ?? DBNull.Value);`);
            csharp.writeLine();
        }

        this.writeExecuteQueryMethod(methodDefinition, this.objectNameProvider.getTableClassName(table), query, 'Text', true, (commandTextVariable: string, csharp: CSharpWriter) => {
            csharp.writeLine(`var whereBuilder = new WhereBuilder(${mappingFieldName});`);
            csharp.writeLine('var wherePart = whereBuilder.ToSql(expression);');
            csharp.writeLine();
            csharp.writeIndent();
            csharp.write(`var ${commandTextVariable} = $@"SELECT ${resultSet.columns.map(c => c.name).join(', ')}`);
            csharp.writeEndOfLine();
            csharp.increaseIndent();
            csharp.writeLine(`FROM [${table.schema}].[${table.name}]`);
            csharp.writeIndent();
            csharp.writeEndOfLine('WHERE {wherePart.Sql}";');
            csharp.decreaseIndent();
        },
            beforeWriteCommandParameters);
    }

    public writeTableDeleteMethod(table: DbTable, idColumn: DbColumn): void {
        const idParameter: SqlServerParameter = this.buildSqlParameterFromColumn(idColumn, 0);
        const query: SqlServerQuery = { parameters: [idParameter] };
        const methodName = this.objectNameProvider.getTableDeleteMethodName(table);
        this.writeExecuteQueryMethod(methodName, null, query, 'Text', true, (commandTextVariable: string, csharp: CSharpWriter) => {
            csharp.writeLine(`var ${commandTextVariable} = @"DELETE FROM [${table.schema}].[${table.name}] WHERE ${idParameter.columnName} = ${QueryMethodWriter.minifyParameterName(idParameter)}";`);
        });
    }

    private buildSqlParameterFromColumn(c: DbColumn, index: number, useIdentityAsOutput: boolean = false): SqlServerParameterWithColumn {
        const paramName = `@${c.name}`;
        const parameter: SqlServerParameterWithColumn = {
            _column: c,
            name: paramName,
            index: index,
            isIdentity: c.isIdentity,
            sqlTypeName: c.sqlTypeName,
            columnName: c.name,
            precision: c.precision,
            scale: c.scale,
            length: c.length,
            direction: (c.isIdentity && useIdentityAsOutput) ? SqlParameterDirection.Output : SqlParameterDirection.Input,
            // objectTypeName: SqlToCSharpTypeMapper.getCSharpTypeName(c.sqlTypeName) || 'object',
            objectTypeName: this.typeNameProvider.getParameterObjectTypeName(c.sqlTypeName, paramName, c.table.name, c.name) || 'object',
            isReadOnly: c.isReadOnly,
            isNullable: c.isNullable,
            isTableValued: false,
            tableType: null
        }
        return parameter;
    }
}