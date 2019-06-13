import { CSharpWriter, ClassDefinition, MethodDefinition, ParameterDefinition } from '@yellicode/csharp';
import { SqlServerStoredProcedure, SqlParameterDirection, SqlServerParameter, SqlServerDatabase, SqlServerQuery, SqlServerTable, SqlServerColumn, QueryType } from '@yellicode/sql-server';
import { ReverseSqlObjectNameProvider, DefaultReverseSqlObjectNameProvider } from '../mapper/reverse-sql-object-name-provider';
import { SqlToCSharpTypeMapper } from '../mapper/sql-to-csharp-type-mapper';
import { SystemDotDataNameMapper } from '../mapper/system-dot-data-name-mapper';
import { ReverseSqlOptions } from '../builder/reverse-sql-options';
import { Logger, ConsoleLogger, LogLevel } from '@yellicode/core';

const connectionStringFieldName = '_dbConnectionString';

export class DataAccessWriter {
    private objectNameProvider: ReverseSqlObjectNameProvider;
    private options: ReverseSqlOptions;
    private logger: Logger;
    
    constructor(private csharp: CSharpWriter, options?: ReverseSqlOptions) {
        this.options = options || {};
        this.objectNameProvider = this.options.objectNameProvider || new DefaultReverseSqlObjectNameProvider(this.options.includeSchema || false);
        this.logger = this.options.logger || new ConsoleLogger(console, LogLevel.Info);
    }

    public writeResultSetClasses(classes: ClassDefinition[]): void {
        classes.forEach(c => {
            this.csharp.writeClassBlock(c, () => {
                c.properties!.forEach(p => {
                    this.csharp.writeAutoProperty(p);
                })
            });
            this.csharp.writeLine();
        });
    }

    public writeDatabaseClass(database: SqlServerDatabase, dbClassName: string): void {
        // Database class
        this.csharp.writeClassBlock({ name: dbClassName, accessModifier: 'public', isPartial: true }, () => {
            // Fields
            this.csharp.writeLine(`private readonly string ${connectionStringFieldName};`);
            // Constructor
            const connStringParam: ParameterDefinition = { name: 'connectionString', typeName: 'string' };
            const ctor: MethodDefinition = { name: dbClassName, accessModifier: 'public', isConstructor: true, parameters: [connStringParam] };
            this.csharp.writeLine();
            this.csharp.writeMethodBlock(ctor, () => {
                this.csharp.writeLine(`this.${connectionStringFieldName} = ${connStringParam.name};`);
            })

            // Stored procedure calls
            if (database.storedProcedures && database.storedProcedures.length) {                
                this.csharp.writeLine();
                this.csharp.writeLine('#region Stored procedure calls');
                this.writeStoredProcedureMethods(database.storedProcedures);
                this.csharp.writeLine('#endregion Stored procedure calls');

            }

            // Table data access calls
            if (database.tables && database.tables.length) {
                this.csharp.writeLine();
                this.csharp.writeLine('#region Table data access calls');
                this.writeTableDataAccessMethods(database.tables);
                this.csharp.writeLine('#endregion Table data access calls');
            }

        });
    }

    // #region table data access

    public writeTableDataAccessMethods(tables: SqlServerTable[]): void {
        tables.forEach(t => {            
            const identityColumn = t.ownColumns.find(c => c.isIdentity);
            // Insert
            if (!this.options.tableInsertMethodFilter || this.options.tableInsertMethodFilter(t.schema!, t.name)) {
                this.writeTableInsertMethod(t);
                this.csharp.writeLine();
            }
            if (identityColumn) {
                // Delete (by id)
                if (!this.options.tableDeleteMethodFilter || this.options.tableDeleteMethodFilter(t.schema!, t.name)) {
                    this.writeTableDeleteMethod(t, identityColumn);
                    this.csharp.writeLine();
                }
                // Update (by id)
                if (!this.options.tableUpdateMethodFilter || this.options.tableUpdateMethodFilter(t.schema!, t.name)) {
                    this.writeTableUpdateMethod(t);
                    this.csharp.writeLine();
                }
                // Get (by id)
            }
            else this.logger.warn(`Cannot generate Delete, Get and Update methods for table '${t.schema}.${t.name}' because the table has no identity column.`);
        });
    }

    private buildSqlParameterFromColumn(c: SqlServerColumn, index: number, useIdentityAsOutput: boolean = false): SqlServerParameter {
        const parameter: SqlServerParameter = {
            name: `@${c.name}`,
            index: index,
            isIdentity: c.isIdentity,
            sqlTypeName: c.sqlTypeName,
            tableName: c.table.name,
            columnName: c.name,
            precision: c.precision,
            scale: c.scale,
            length: c.length,
            direction: (c.isIdentity && useIdentityAsOutput) ? SqlParameterDirection.Output : SqlParameterDirection.Input,
            objectTypeName: SqlToCSharpTypeMapper.getCSharpTypeName(c.sqlTypeName) || 'object',
            objectProperty: null,
            isReadOnly: c.isReadOnly,
            isNullable: c.isNullable,
            isTableValued: false,
            tableType: null
        }
        return parameter;
    }

    private writeTableInsertMethod(table: SqlServerTable): void {
        const parameters: SqlServerParameter[] = table.ownColumns
            .filter(c => !c.hasDefaultValue) // let the database handle default values
            .map((c, index) => { return this.buildSqlParameterFromColumn(c, index, true); } 
            );

        const query: SqlServerQuery = { queryType: QueryType.Insert, parameters: parameters, relatedTable: table, modelType: null };
        const methodName = this.objectNameProvider.getTableInsertMethodName(table);
        this.writeExecuteQueryMethod(methodName, null, query, 'Text', true, (commandTextVariable: string, csharp: CSharpWriter) => {
            const inputParameters = parameters.filter(p => !p.isReadOnly);
            const idParameter = parameters.find(c => c.isIdentity);
        
            csharp.writeLine(`var ${commandTextVariable} = @"INSERT INTO [${table.schema}].[${table.name}]`);
            csharp.writeLineIndented(`(${inputParameters.map(p => `[${p.columnName}]`).join(', ')})`);
            
            if (idParameter){
                csharp.writeLineIndented(`VALUES (${inputParameters.map(p => `${DataAccessWriter.minifyParameterName(p)}`).join(', ')})`);
                csharp.writeLineIndented(`SET ${DataAccessWriter.minifyParameterName(idParameter)} = SCOPE_IDENTITY()";`);
            }
            else csharp.writeLineIndented(`VALUES (${inputParameters.map(p => `${DataAccessWriter.minifyParameterName(p)}`).join(', ')})";`);
        });
    }

    private writeTableUpdateMethod(table: SqlServerTable): void {
        const parameters: SqlServerParameter[] = table.ownColumns       
            .map((c, index) => { return this.buildSqlParameterFromColumn(c, index); } 
        );
        const query: SqlServerQuery = { queryType: QueryType.Insert, parameters: parameters, relatedTable: table, modelType: null };
        
        const methodName = this.objectNameProvider.getTableUpdateMethodName(table);
        this.writeExecuteQueryMethod(methodName, null, query, 'Text', true, (commandTextVariable: string, csharp: CSharpWriter) => {
            const inputParameters = parameters.filter(p => !p.isReadOnly);
            const idParameter = parameters.find(c => c.isIdentity);

            csharp.writeLine(`var ${commandTextVariable} = @"UPDATE [${table.schema}].[${table.name}] SET`);
            csharp.increaseIndent();
            inputParameters.forEach((p, index) => {
                csharp.writeIndent();
                csharp.write(`[${p.columnName}] = ${DataAccessWriter.minifyParameterName(p)}`);
                if (index < inputParameters.length - 1) csharp.writeEndOfLine(',');
                else csharp.writeEndOfLine();
            });
            csharp.writeLine(`WHERE ${idParameter!.columnName} = ${DataAccessWriter.minifyParameterName(idParameter!)}";`);
            csharp.decreaseIndent();
        });
    }

    private writeTableDeleteMethod(table: SqlServerTable, identityColumn: SqlServerColumn): void { 
        const idParameter: SqlServerParameter = this.buildSqlParameterFromColumn(identityColumn, 0);
        const query: SqlServerQuery = { queryType: QueryType.Delete, parameters: [idParameter], relatedTable: table, modelType: null };
        const methodName = this.objectNameProvider.getTableDeleteMethodName(table);
        this.writeExecuteQueryMethod(methodName, null, query, 'Text', true, (commandTextVariable: string, csharp: CSharpWriter) => {
            csharp.writeLine(`var ${commandTextVariable} = @"DELETE FROM [${table.schema}].[${table.name}] WHERE ${idParameter.columnName} = ${DataAccessWriter.minifyParameterName(idParameter)}";`);
        });
    }

    // #endregion table data access

    // #region stored procedure data access

    public writeStoredProcResultSetMappers(storedProcedures: SqlServerStoredProcedure[], resultSetClasses: ClassDefinition[]): void {
        storedProcedures.forEach(sp => {
            if (!sp.resultSets || !sp.resultSets.length) return;

            const resultSet = sp.resultSets[0];

            // Find the corresponding result set class
            const resultSetClassName = this.objectNameProvider.getResultSetClassName(sp);
            const resultSetCassDefinition = resultSetClasses.find(cd => cd.name === resultSetClassName);
            if (!resultSetCassDefinition) {                
                this.logger.warn(`Unable to find result set class definition named '${resultSetClassName}'.`);
                return;
            }
            const mapperClassDefinition: ClassDefinition = {
                name: this.objectNameProvider.getResultSetMapperClassName(resultSetCassDefinition.name),
                accessModifier: 'internal',
                xmlDocSummary: [`Maps <see cref="IDataRecord"/> objects to <see cref="${resultSetClassName}"/> objects.`]
            };

            this.csharp.writeClassBlock(mapperClassDefinition, () => {
                const dataRecordParameter: ParameterDefinition = { name: 'dataRecord', typeName: 'IDataRecord' };
                const mapDataRecordMethod: MethodDefinition = { name: 'MapDataRecord', accessModifier: 'public', isStatic: true, returnTypeName: resultSetCassDefinition.name, parameters: [dataRecordParameter] };
                this.csharp.writeLine();
                this.csharp.writeMethodBlock(mapDataRecordMethod, () => {
                    this.csharp.writeLine(`if (${dataRecordParameter.name} == null) return null;`);
                    this.csharp.writeLine(`var result = new ${resultSetCassDefinition.name}();`);
                    resultSet.columns.forEach(c => {
                        this.csharp.writeLine(`if (!dataRecord.IsDBNull(${c.ordinal}))`);
                        this.csharp.writeCodeBlock(() => {
                            const propertyName = this.objectNameProvider.getResultSetColumnPropertyName(c);
                            const getValueMethod = SystemDotDataNameMapper.getDataRecordGetValueMethod(c.objectTypeName);
                            // TODO: GetBytes(int i, long fieldOffset, byte[] buffer, int bufferoffset, int length)                        
                            this.csharp.writeLine(`result.${propertyName} = dataRecord.${getValueMethod}(${c.ordinal});`);
                        });
                    });
                    this.csharp.writeLine('return result;');
                });
            });
        })
    }

    private writeStoredProcedureMethods(storedProcedures: SqlServerStoredProcedure[]): void {
        storedProcedures.forEach(sp => {
            this.writeStoredProcMethod(sp);
        });
    }

    private writeStoredProcMethod(sp: SqlServerStoredProcedure): void {
        const methodName = this.objectNameProvider.getStoredProcedureMethodName(sp);             
        const hasResultSet = sp.resultSets && sp.resultSets.length;
        const resultSetClassName = hasResultSet ? this.objectNameProvider.getResultSetClassName(sp): null;

        this.writeExecuteQueryMethod(methodName, resultSetClassName, sp, 'StoredProcedure', false, (commandTextVariable: string, csharp: CSharpWriter) => {
            csharp.writeLine(`var ${commandTextVariable} = "[${sp.schema}].[${sp.name}]";`);
        });
    }

    // #endregion stored procedure data access

    private writeExecuteQueryMethod(
        methodName: string,
        resultSetClassName: string | null,
        q: SqlServerQuery,
        commandType: 'StoredProcedure' | 'Text',
        minifyParamNames: boolean,
        writeCommandText: (commandTextVariable: string, csharp: CSharpWriter) => void
        ): void {

        const method: MethodDefinition = { name: methodName, accessModifier: 'public' };
        
        // Are there any result sets?        
        const hasResultSet = q.resultSets && q.resultSets.length;
        if (hasResultSet) {            
            method.returnTypeName = `IEnumerable<${resultSetClassName}>`;
        }
        else {                        
            // Note: identities are returned as output parameter
            method.returnTypeName = 'void'; 
        }
        
        const methodParametersBySqlName: Map<string, ParameterDefinition> = new Map<string, ParameterDefinition>();

        const methodParameters: ParameterDefinition[] = [];
        q.parameters.forEach(p => {
            const methodParameter: ParameterDefinition = {
                name: this.objectNameProvider.getParameterName(p),
                typeName: p.objectTypeName
            };
            methodParameter.isOutput = p.direction === SqlParameterDirection.Output || p.direction === SqlParameterDirection.InputOutput;
            // We don't know if the SP parameter (or the related column, at this moment) is nullable, so allow every input parameter to be null
            methodParameter.isNullable = p.isNullable && SqlToCSharpTypeMapper.canBeNullable(methodParameter.typeName);
            methodParameters.push(methodParameter);
            methodParametersBySqlName.set(p.name, methodParameter);
        });

        // Make output parameters show up as last
        method.parameters = methodParameters.sort((a, b) => { return (a.isOutput === b.isOutput) ? 0 : a.isOutput ? 1 : -1; });

        // Write          
        this.csharp.writeMethodBlock(method, () => {
            writeCommandText('commandText', this.csharp);
            this.csharp.writeLine();
            this.csharp.writeLine(`using (var connection = new SqlConnection(${connectionStringFieldName}))`);
            this.csharp.writeLine(`using (var command = new SqlCommand(commandText, connection) { CommandType = CommandType.${commandType} })`);
            this.csharp.writeCodeBlock(() => {
                q.parameters.forEach(p => {
                    this.writeCommandParameter(p, methodParametersBySqlName, minifyParamNames);
                    this.csharp.writeLine();
                });
                this.csharp.writeLine('// Execute');
                this.csharp.writeLine('connection.Open();');
                if (hasResultSet) {
                    this.csharp.writeLine(`var reader = command.ExecuteReader();`);
                    this.csharp.writeLine('if (reader.HasRows)');
                    this.csharp.writeCodeBlock(() => {
                        this.csharp.writeLine('while (reader.Read())');
                        this.csharp.writeCodeBlock(() => {
                            this.csharp.writeLine(`yield return ${this.objectNameProvider.getResultSetMapperClassName(resultSetClassName!)}.MapDataRecord(reader);`);
                        });
                    });
                    // this.csharp.writeLine('else resultSet = null;');
                }
                else {
                    this.csharp.writeLine('command.ExecuteNonQuery();');
                }
                this.csharp.writeLine('connection.Close();');
                // Fill output parameters
                q.parameters.forEach(p => {
                    if (p.direction !== SqlParameterDirection.InputOutput && p.direction !== SqlParameterDirection.Output) {
                        return;
                    }
                    const methodParameter = methodParametersBySqlName.get(p.name)!;
                    this.csharp.writeLine(`${methodParameter.name} = (${methodParameter.typeName}) ${methodParameter.name}Parameter.Value;`);
                })
            });
            // if (hasResultSet) {
            //     this.csharp.writeLine(`return resultSet;`);
            // }
        });
        this.csharp.writeLine();
    }

    private writeCommandParameter(p: SqlServerParameter, methodParametersBySqlName: Map<string, ParameterDefinition>, minifyParamNames: boolean): void {
        const methodParameter = methodParametersBySqlName.get(p.name)!;
        const parameterName = minifyParamNames ? DataAccessWriter.minifyParameterName(p) : p.name;
        const variableName = `${methodParameter.name}Parameter`;
        const sqlDbType = p.isTableValued ? 'Structured' : SystemDotDataNameMapper.getSqlDbType(p.sqlTypeName);
        // console.log(`getFromSqlType for ${p.typeName} returned ${sqlDbType}`);
        this.csharp.writeLine(`// ${p.name}`);
        if (methodParameter.isOutput) {
            // Make a SqlParameter that will contain the output       
            this.csharp.writeLine(`var ${variableName} = new SqlParameter("${parameterName}", SqlDbType.${sqlDbType}) {Direction = ParameterDirection.Output};`);
            this.csharp.writeLine(`command.Parameters.Add(${variableName});`);
            return;
        }
        // The parameter is an input parameter

        // if (p.dbParameter.isTableValued){
        //     const adapterName = `${p.csharpTypeName}TableAdapter`;
        //     this.writer.writeLine(`command.Parameters.Add(${adapterName}.CreateAsDataParameter("@${dbParameter.name}", ${p.csharpName}));`);                    
        // }
        const valueSelector = methodParameter.isNullable ? `${methodParameter.name}.GetValueOrDefault()` : methodParameter.name;
        this.csharp.writeIndent();
        this.csharp.write(`var ${variableName} = new SqlParameter("${parameterName}", SqlDbType.${sqlDbType}) {`);
        this.csharp.write(`Direction = ParameterDirection.Input, Value = ${valueSelector}`);
        if (p.precision || p.scale) {
            this.csharp.write(`, Precision = ${p.precision}`);
        }
        if (p.scale) {
            this.csharp.write(`, Scale = ${p.scale}`);
        }
        if (p.length) {
            this.csharp.write(`, Size = ${p.length}`);
        }
        this.csharp.writeEndOfLine('};');

        if (methodParameter.isNullable) {
            this.csharp.writeLine(`if (!${methodParameter.name}.HasValue)`);
        }
        else {
            this.csharp.writeLine(`if (${variableName}.Value == null)`);
        }
        this.csharp.writeLineIndented(`${variableName}.Value = DBNull.Value;`);
        this.csharp.writeLine(`command.Parameters.Add(${variableName});`);
    }

    private static minifyParameterName(p: SqlServerParameter): string {
        return `@p${p.index}`;
    }
}