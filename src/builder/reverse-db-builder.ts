import * as sql from 'mssql';
import { ReverseSqlOptions, BuilderObjectTypes } from '../reverse-sql-options';
import { SqlParameterDirection, SqlResultSetColumn, DbTable } from '../model/database';
import { SqlServerDatabase, SqlServerParameter, SqlStoredProcedure } from '../model/sql-server-database';

import { Logger, ConsoleLogger, LogLevel } from '@yellicode/core';
import { storedProceduresSql, parametersSql, tableColumnsSql, columnConstraintsSql, tableTypeColumnsSql } from './queries/query-statements';
import { StoredProceduresSqlResult, ParametersSqlResult, ParameterMode, ResultSetSqlResult, ColumnsSqlResult, ColumnConstraintsSqlResult } from './queries/query-interfaces';
import { SqlToCSharpTypeMapper } from '../mapper/sql-to-csharp-type-mapper';
import { TableBuilder } from './table-builder';

export class ReverseDbBuilder {
    private pool: sql.ConnectionPool;
    private options: ReverseSqlOptions;
    private includeTables: boolean;
    private includeTableTypes: boolean;
    private includeStoredProcedures: boolean;
    private logger: Logger;

    constructor(connectionString: string, options?: ReverseSqlOptions);
    constructor(connectionPool: sql.ConnectionPool, options?: ReverseSqlOptions);
    constructor(poolOrConnectionString: any, options?: ReverseSqlOptions) {
        this.options = options || {};

        this.logger = this.options.logger || new ConsoleLogger(console, LogLevel.Info);
        if (!poolOrConnectionString)
            throw 'Cannot create SqlServerDbBuilder instance. Please provide a connection pool or connection string in the constructor';

        if (typeof poolOrConnectionString == 'string') {
            this.pool = new sql.ConnectionPool(poolOrConnectionString);
        }
        else this.pool = poolOrConnectionString;

        const objectTypes = this.options.objectTypes || BuilderObjectTypes.All;
        this.includeTables = !!(objectTypes & BuilderObjectTypes.Tables);
        this.includeTableTypes = !!(objectTypes & BuilderObjectTypes.TableTypes);
        this.includeStoredProcedures = !!(objectTypes & BuilderObjectTypes.StoredProcedures);
    }

    public build(): Promise<SqlServerDatabase> {
        return this.connect()
            .then(() => {
                return this.buildInternal();
            });
    }

    private connect(): Promise<void> {
        if (this.pool.connected) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            this.pool.connect()
                .then((p) => {
                    this.pool = p;
                    this.logger.verbose(`Successfully connected to database.`);
                    resolve();
                }).catch((err) => {
                    this.logger.error(`Failed to connect to the database: ${err}.`);
                    reject(`Failed to connect to the database: ${err}.`);
                });
        })

    }

    private buildInternal(): Promise<SqlServerDatabase> {
        let tables: DbTable[];
        let tableTypes: DbTable[];
        let storedProcedures: SqlStoredProcedure[];

        const promises: Promise<any>[] = [];

        // 1: Tables
        promises.push(this.buildTables().then(t => {
            tables = t;
        }));

        // 2: Table types
        const tableTypesPromise = this.buildTableTypes().then(tt => {
            tableTypes = tt;
            return tt;
        });
        promises.push(tableTypesPromise);

        // 3: Stored procedures
        promises.push(this.buildStoredProcedures(tableTypesPromise).then(sp => {
            storedProcedures = sp;
        }));

        return Promise.all(promises).then(() => {
            if (!tables.length && !storedProcedures.length) {
                this.logger.warn(`Could not find any tables or stored procedures in the database. Please make sure that you have a working connection with the approriate permissions.`);
            }
            const db: SqlServerDatabase = {
                tables: tables,
                tableTypes: tableTypes,
                storedProcedures: storedProcedures
            }
            return db;
        })
    }

    private buildTables(): Promise<DbTable[]> {
        if (!this.includeTables)
            return Promise.resolve([]);

        let columnsRecordSet: sql.IRecordSet<ColumnsSqlResult> | null = null;
        let columnConstraintsRecordSet: sql.IRecordSet<ColumnConstraintsSqlResult> | null = null;
        const recordSetPromises: Promise<void>[] = [];

        // Get column information (this includes table information as well, so no table info without columns)
        recordSetPromises.push(this.pool.request().query(tableColumnsSql)
            .then((results: sql.IResult<ColumnsSqlResult>) => {
                if (results && results.recordsets.length)
                    columnsRecordSet = results.recordsets[0];
                else
                    this.logger.warn('Could not find any tables or columns. If this is unexpected, please check the current user permissions.');
            }));

        recordSetPromises.push(this.pool.request().query(columnConstraintsSql)
            .then((results: sql.IResult<ColumnConstraintsSqlResult>) => {
                if (results && results.recordsets.length)
                    columnConstraintsRecordSet = results.recordsets[0];
                else
                    this.logger.warn('Could not find any column constraints. If this is unexpected, please check the current user permissions.');
            }));

        return Promise.all(recordSetPromises).then(() => {
            if (!columnsRecordSet || !columnConstraintsRecordSet)
                return [];

            const tableBuilder: TableBuilder = new TableBuilder(this.options.tableFilter);
            return tableBuilder.build(columnsRecordSet, columnConstraintsRecordSet);
        })
    }

    private buildTableTypes(): Promise<DbTable[]> {
        if (!this.includeTableTypes)
            return Promise.resolve([]);

        let columnsRecordSet: sql.IRecordSet<ColumnsSqlResult> | null = null;
        const recordSetPromises: Promise<void>[] = [];

        // Get column information (this includes table information as well, so no table info without columns)
        recordSetPromises.push(this.pool.request().query(tableTypeColumnsSql)
            .then((results: sql.IResult<ColumnsSqlResult>) => {
                if (results && results.recordsets.length)
                    columnsRecordSet = results.recordsets[0];
            }));

        return Promise.all(recordSetPromises).then(() => {
            if (!columnsRecordSet)
                return [];

            const tableBuilder: TableBuilder = new TableBuilder(this.options.tableTypeFilter);
            return tableBuilder.build(columnsRecordSet, null /* we have no constraints for table types */);
        })
    }

    private buildStoredProcedures(tableTypesPromise: Promise<DbTable[]>): Promise<SqlStoredProcedure[]> {
        if (!this.includeStoredProcedures)
            return Promise.resolve([]);

        // Record sets that neeed to be combined into a single SqlServerStoredProcedure[] result
        let objectsRecordSet: sql.IRecordSet<StoredProceduresSqlResult> | null = null;
        let parametersRecordSet: sql.IRecordSet<ParametersSqlResult> | null = null;

        const promises: Promise<any>[] = [];
        let tableTypes: DbTable[] = [];

        // 1. Get the actual objects
        promises.push(this.pool
            .request().query(storedProceduresSql)
            .then((results: sql.IResult<StoredProceduresSqlResult>) => {
                if (results && results.recordsets.length)
                    objectsRecordSet = results.recordsets[0];
                else
                    this.logger.warn('Could not find any stored procedures. If this is unexpected, please check the current user permissions.');
            })
        );

        // 2. Get the parameters
        promises.push(this.pool.request().query(parametersSql)
            .then((results: sql.IResult<ParametersSqlResult>) => {
                if (results && results.recordsets.length)
                    parametersRecordSet = results.recordsets[0];
            })
        );

        // 3. Wait for table types        
        promises.push(tableTypesPromise.then((tt) => {
            tableTypes = tt;
        }));

        // We got all we need, put it all together
        return Promise.all(promises).then(() => {
            const storedProcs: SqlStoredProcedure[] = [];
            if (!objectsRecordSet)
                return storedProcs; // bad luck

            objectsRecordSet.forEach(o => {
                if (o.ROUTINE_TYPE !== 'PROCEDURE')
                    return; // can also be a Table-Valued function, we should support these in the future

                if (!this.shouldIncludedStoredProcedure(o.SPECIFIC_SCHEMA, o.SPECIFIC_NAME))
                    return;

                const proc: SqlStoredProcedure = {                   
                    name: o.SPECIFIC_NAME,
                    schema: o.SPECIFIC_SCHEMA,
                    parameters: this.getParametersForStoredProcedure(parametersRecordSet, o, tableTypes),
                    resultSets: [] // we will retrieve these below
                };

                storedProcs.push(proc);
            });
            return storedProcs;
        }).then((storedProcs => {
            // 3: Get the result set(s)         
            // console.log(`Found ${storedProcs.length} stored procedures. Discovering result sets...`);            
            return this.populateStoredProcResultSets(storedProcs).then(() => {
                return storedProcs;
            });
        }));

    }

    private populateStoredProcResultSets(storedProcs: SqlStoredProcedure[]): Promise<void[]> {
        const promises: Promise<void>[] = [];

        storedProcs.forEach(sp => {

            const sql = `SELECT column_ordinal, name, TYPE_NAME(system_type_id) type_name, source_table, source_column, is_nullable, is_hidden FROM sys.dm_exec_describe_first_result_set('EXEC [${sp.schema}].[${sp.name}]', NULL, 1)`;
            // console.log(`Retrieving result set of ${sp.name}.`);            
            promises.push(this.pool.request().query(sql).then((results: sql.IResult<ResultSetSqlResult>) => {
                const resultcolumns = results.recordsets[0];
                if (!resultcolumns || !resultcolumns.length)
                    return;

                const resultSetColumns: SqlResultSetColumn[] = [];
                resultcolumns.filter(c => !c.is_hidden).forEach(c => {
                    const ordinal = +c.column_ordinal;
                    if (ordinal === 0)
                        return;

                    const col: SqlResultSetColumn = {
                        ordinal: ordinal - 1,
                        name: c.name || undefined,
                        // sourceTable: c.source_table,
                        // sourceColumn: c.source_column,                                                
                        isNullable: c.is_nullable,                        
                        sqlTypeName: c.type_name,
                        objectTypeName: SqlToCSharpTypeMapper.getCSharpTypeName(c.type_name) || 'object'
                    }
                    resultSetColumns.push(col);
                });

                if (!resultSetColumns.length)
                    return;

                // Sort by ordinal (just to be sure)
                resultSetColumns.sort((a, b) => {
                    return (a.ordinal < b.ordinal) ? -1 : (a.ordinal > b.ordinal) ? 1 : 0;
                });

                // Because we use dm_exec_describe_first_result_set, we will never get more than one result set.
                // The alternative, SET FMTONLY ON/OFF, is deprecated in newer versions of SQL Server
                sp.resultSets!.push({ columns: resultSetColumns });
            }));
        });
        return Promise.all(promises);
    }

    private getParametersForStoredProcedure(
        parametersRecordSet: sql.IRecordSet<ParametersSqlResult> | null,
        storedProcedure: StoredProceduresSqlResult,
        tableTypes: DbTable[]): SqlServerParameter[] {

        const result: SqlServerParameter[] = [];
        if (!parametersRecordSet)
            return result;

        parametersRecordSet
            .filter(p => p.SPECIFIC_NAME === storedProcedure.SPECIFIC_NAME && p.SPECIFIC_SCHEMA === storedProcedure.SPECIFIC_SCHEMA)
            .forEach((p, index) => {
                const isTableType = p.DATA_TYPE === 'table type' && !!p.USER_DEFINED_TYPE_NAME;
                const sqlTypeName = isTableType ? p.USER_DEFINED_TYPE_NAME : p.DATA_TYPE;
                // Default to DataTable if isTableType. We can override this when we generate the actual table type classes.
                const objectTypeName = isTableType ? 'DataTable' : SqlToCSharpTypeMapper.getCSharpTypeName(sqlTypeName) || 'object';
                const isNullable = true; // we just don't know because INFORMATION_SCHEMA.PARAMETERS doesn't tell              
                const parameter: SqlServerParameter = {
                    // SqlParameter
                    name: p.PARAMETER_NAME, // includes @
                    index: index,                    
                    isIdentity: false,                    
                    objectTypeName: objectTypeName,                    
                    columnName: null,
                    sqlTypeName: sqlTypeName!,
                    length: p.CHARACTER_MAXIMUM_LENGTH || null,
                    precision: p.NUMERIC_PRECISION || null,
                    scale: p.NUMERIC_SCALE || null,
                    direction: this.parseParameterMode(p.PARAMETER_MODE, p.PARAMETER_NAME),                    
                    isReadOnly: isTableType,
                    isNullable: isNullable,
                    // SqlServerParameter only
                    isTableValued: isTableType,
                    tableType: isTableType ? (tableTypes.find(tt => tt.name === p.USER_DEFINED_TYPE_NAME && tt.schema === p.USER_DEFINED_TYPE_SCHEMA) || null) : null
                };
                result.push(parameter);
            });
        return result;
    }

    private parseParameterMode(mode: ParameterMode, name: string): SqlParameterDirection {
        switch (mode) {
            case 'IN':
                return SqlParameterDirection.Input;
            case 'OUT':
                return SqlParameterDirection.Output;
            case 'INOUT':
                return SqlParameterDirection.InputOutput;
            default:
                this.logger.warn(`Unrecognised parameter mode '${mode}' for parameter '${name}'. Falling back to SqlParameterDirection.Input.`);
                return SqlParameterDirection.Input;
        }
    }

    private shouldIncludedStoredProcedure(schema: string, name: string): boolean {
        if (!this.options.storedProcedureFilter) return true;

        return this.options.storedProcedureFilter(schema, name);
    }
}
