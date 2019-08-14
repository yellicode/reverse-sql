import { CSharpWriter, ClassDefinition, MethodDefinition, ParameterDefinition } from '@yellicode/csharp';
import { SqlServerStoredProcedure, SqlParameterDirection, SqlServerParameter, SqlServerDatabase, SqlServerQuery, SqlServerTable, SqlServerColumn, QueryType, SqlResultSet, Table } from '@yellicode/sql-server';
import { ReverseSqlObjectNameProvider, DefaultReverseSqlObjectNameProvider } from '../mapper/reverse-sql-object-name-provider';
import { SqlToCSharpTypeMapper } from '../mapper/sql-to-csharp-type-mapper';
import { SystemDotDataNameMapper } from '../mapper/system-dot-data-name-mapper';
import { ReverseSqlOptions } from '../builder/reverse-sql-options';
import { Logger, ConsoleLogger, LogLevel, NameUtility } from '@yellicode/core';
import { TableResultSetBuilder } from '../builder/table-result-set-builder';
import { ClassDefinitionWithResultSet, ClassDefinitionWithTable } from '../builder/class-definition-extensions';
import { SqlParameterWithColumn } from '../builder/sql-parameter-with-column';
import { WhereBuilderWriter } from './where-builder.writer';

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

    public writeClasses(classes: ClassDefinition[]): void {
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

            // Write the WhereBuilder class
            this.csharp.writeLine();
            this.csharp.writeLine('#region Infrastructure');
            WhereBuilderWriter.write(this.csharp);
            this.csharp.writeLine('#endregion Infrastructure');
        });
    }

    // #region table data access

    public writeTableDataAccessMethods(tables: SqlServerTable[]): void {
        tables.forEach(t => {
            // const primaryKey = t.ownColumns.find(c => c.isPrimaryKey); // we could use the PKs, but this will result in a confusing method signature if there are multiple PKs
            const idColumn = t.ownColumns.find(c => c.isIdentity);

            // Insert
            if (!this.options.tableInsertMethodFilter || this.options.tableInsertMethodFilter(t.schema!, t.name)) {
                this.writeTableInsertMethods(t);
                this.csharp.writeLine();
            }
            if (idColumn) {
                // Delete (by PK)
                if (!this.options.tableDeleteMethodFilter || this.options.tableDeleteMethodFilter(t.schema!, t.name)) {
                    this.writeTableDeleteMethod(t, idColumn);
                    this.csharp.writeLine();
                }
                // Update (by PK)
                if (!this.options.tableUpdateMethodFilter || this.options.tableUpdateMethodFilter(t.schema!, t.name)) {
                    this.writeTableUpdateMethods(t);
                    this.csharp.writeLine();
                }
                // Select (by PK)
                if (!this.options.tableSelectByPrimaryKeyMethodFilter || this.options.tableSelectByPrimaryKeyMethodFilter(t.schema!, t.name)) {
                    this.writeTableSelectByPrimaryKeyMethod(t);
                    this.csharp.writeLine();
                }
                // SelectWhere
                if (!this.options.tableSelectByExpressionMethodFilter || this.options.tableSelectByExpressionMethodFilter(t.schema!, t.name)) {
                    this.writeTableSelectByExpressionMethod(t);
                    this.csharp.writeLine();
                }
            }
            else this.logger.warn(`Cannot generate Delete, Get and Update methods for table '${t.schema}.${t.name}' because the table has no identity column.`);
        });
    }

    private buildSqlParameterFromColumn(c: SqlServerColumn, index: number, useIdentityAsOutput: boolean = false): SqlParameterWithColumn {
        const parameter: SqlParameterWithColumn = {
            _column: c,
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

    private writeTableInsertMethods(table: SqlServerTable): void {
        const parameters: SqlParameterWithColumn[] = table.ownColumns
            .filter(c => !c.hasDefaultValue) // let the database handle default values
            .map((c, index) => { return this.buildSqlParameterFromColumn(c, index, true); }
            );

        const idParameter = parameters.find(c => c.isIdentity);
        const methodName = this.objectNameProvider.getTableInsertMethodName(table);
        const columns = table.ownColumns;

        // Write an overload that acceps individual parameters
        const query: SqlServerQuery = { queryType: QueryType.Insert, parameters: parameters, relatedTable: table, modelType: null };
        this.writeExecuteQueryMethod(methodName, null, query, 'Text', true, (commandTextVariable: string, csharp: CSharpWriter) => {
            const inputParameters = parameters.filter(p => !p.isReadOnly);

            csharp.writeLine(`var ${commandTextVariable} = @"INSERT INTO [${table.schema}].[${table.name}]`);
            csharp.writeLineIndented(`(${inputParameters.map(p => `[${p.columnName}]`).join(', ')})`);

            if (idParameter) {
                csharp.writeLineIndented(`VALUES (${inputParameters.map(p => `${DataAccessWriter.minifyParameterName(p)}`).join(', ')})`);
                csharp.writeLineIndented(`SET ${DataAccessWriter.minifyParameterName(idParameter)} = SCOPE_IDENTITY()";`);
            }
            else csharp.writeLineIndented(`VALUES (${inputParameters.map(p => `${DataAccessWriter.minifyParameterName(p)}`).join(', ')})";`);
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

    private writeTableUpdateMethods(table: SqlServerTable): void {
        const idColumn = table.ownColumns.find(c => c.isIdentity);
        if (!idColumn)
            return;

        const idParameter = this.buildSqlParameterFromColumn(idColumn, 0);
        const whereParameters: SqlParameterWithColumn[] = [idParameter];
        const indexOffset = whereParameters.length;

        const updateParameters: SqlParameterWithColumn[] = table.ownColumns
            // .filter(c => !c.isPrimaryKey) // same here
            .filter(c => !c.isIdentity)
            .map((c, index) => { return this.buildSqlParameterFromColumn(c, indexOffset + index); }
            );

        if (!updateParameters.length) {
            return;
        }

        // Write an overload that acceps individual parameters
        const allParameters = [...whereParameters, ...updateParameters];
        const query: SqlServerQuery = { queryType: QueryType.Update, parameters: allParameters, relatedTable: table, modelType: null };
        const methodName = this.objectNameProvider.getTableUpdateMethodName(table);
        this.writeExecuteQueryMethod(methodName, null, query, 'Text', true, (commandTextVariable: string, csharp: CSharpWriter) => {
            const idParameterName = this.objectNameProvider.getParameterName(idParameter);
            csharp.writeLine(`if (${idParameterName} <= 0) throw new ArgumentOutOfRangeException(nameof(${idParameterName}));`);
            csharp.writeLine();
            csharp.writeLine(`var ${commandTextVariable} = @"UPDATE [${table.schema}].[${table.name}] SET`);
            csharp.increaseIndent();
            updateParameters.forEach((p, index) => {
                csharp.writeIndent();
                csharp.write(`[${p.columnName}] = ${DataAccessWriter.minifyParameterName(p)}`);
                if (index < updateParameters.length - 1) csharp.writeEndOfLine(',');
                else csharp.writeEndOfLine();
            });
            csharp.writeIndent();
            csharp.write('WHERE ');
            csharp.write(whereParameters.map(p => `${p.columnName} = ${DataAccessWriter.minifyParameterName(p)}";`).join(' AND '));
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

    private writeTableSelectByPrimaryKeyMethod(table: SqlServerTable): void {
        const whereParameters: SqlServerParameter[] = table.ownColumns
            .filter(c => c.isPrimaryKey)
            .map((c, index) => { return this.buildSqlParameterFromColumn(c, index); }
            );

        if (!whereParameters.length) {
            return;
        }

        const resultSet: SqlResultSet = { hasSingleRecord: true, columns: table.ownColumns.map((c, index) => TableResultSetBuilder.buildResultSetColumn(c, index)) };
        const query: SqlServerQuery = { queryType: QueryType.SelectSingle, parameters: whereParameters, relatedTable: table, modelType: null, resultSets: [resultSet] };

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
            csharp.write(whereParameters.map(p => `${p.columnName} = ${DataAccessWriter.minifyParameterName(p)}";`).join(' AND '));
            csharp.writeEndOfLine();
            csharp.decreaseIndent();
        });
    }

    private writeTableSelectByExpressionMethod(table: SqlServerTable): void {
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
        const resultSet: SqlResultSet = { hasSingleRecord: false, columns: table.ownColumns.map((c, index) => TableResultSetBuilder.buildResultSetColumn(c, index)) };
        const query: SqlServerQuery = { queryType: QueryType.SelectSingle /* TODO: Multiple/ */, parameters: [], relatedTable: table, modelType: null, resultSets: [resultSet] };

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

    private writeTableDeleteMethod(table: SqlServerTable, idColumn: SqlServerColumn): void {
        const idParameter: SqlServerParameter = this.buildSqlParameterFromColumn(idColumn, 0);
        const query: SqlServerQuery = { queryType: QueryType.Delete, parameters: [idParameter], relatedTable: table, modelType: null };
        const methodName = this.objectNameProvider.getTableDeleteMethodName(table);
        this.writeExecuteQueryMethod(methodName, null, query, 'Text', true, (commandTextVariable: string, csharp: CSharpWriter) => {
            csharp.writeLine(`var ${commandTextVariable} = @"DELETE FROM [${table.schema}].[${table.name}] WHERE ${idParameter.columnName} = ${DataAccessWriter.minifyParameterName(idParameter)}";`);
        });
    }

    // #endregion table data access

    // #region stored procedure data access

    public writeResultSetMappers(resultSetClasses: ClassDefinition[]): void {
        resultSetClasses.forEach(cd => {
            this.writeResultSetMapper(cd, (cd as ClassDefinitionWithResultSet)._resultSet);
            this.csharp.writeLine();
        })
    }

    private writeResultSetMapper(classDefinition: ClassDefinition, resultSet: SqlResultSet): void {
        if (!resultSet) {
            this.logger.verbose(`ClassDefinition '${classDefinition.name}' does not have a related result set.`);
            return; // not a ClassDefinitionWithResultSet?
        }

        const mapperClassDefinition: ClassDefinition = {
            name: this.objectNameProvider.getResultSetMapperClassName(classDefinition.name),
            accessModifier: 'internal',
            xmlDocSummary: [`Maps <see cref="IDataRecord"/> objects to <see cref="${classDefinition.name}"/> objects.`]
        };

        this.csharp.writeClassBlock(mapperClassDefinition, () => {
            const dataRecordParameter: ParameterDefinition = { name: 'dataRecord', typeName: 'IDataRecord' };
            const mapDataRecordMethod: MethodDefinition = { name: 'MapDataRecord', accessModifier: 'public', isStatic: true, returnTypeName: classDefinition.name, parameters: [dataRecordParameter] };
            this.csharp.writeMethodBlock(mapDataRecordMethod, () => {
                this.csharp.writeLine(`if (${dataRecordParameter.name} == null) return null;`);
                this.csharp.writeLine(`var result = new ${classDefinition.name}();`);
                resultSet.columns.forEach(c => {
                    this.csharp.writeLine(`if (!dataRecord.IsDBNull(${c.ordinal}))`);
                    this.csharp.writeCodeBlock(() => {
                        const propertyName = this.objectNameProvider.getColumnPropertyName(c);
                        const getValueMethod = SystemDotDataNameMapper.getDataRecordGetValueMethod(c.objectTypeName);
                        // TODO: GetBytes(int i, long fieldOffset, byte[] buffer, int bufferoffset, int length)                        
                        this.csharp.writeLine(`result.${propertyName} = dataRecord.${getValueMethod}(${c.ordinal});`);
                    });
                });
                this.csharp.writeLine('return result;');
            });
        });
    }

    public writeTableTypeDataReaders(tableTypeClasses: ClassDefinition[]): void {
        tableTypeClasses.forEach(cd => {
            this.writeTableTypeDataReader(cd, (cd as ClassDefinitionWithTable)._table);
        })
    }

    private writeTableTypeDataReader(classDefinition: ClassDefinition, tableType: Table): void {
        if (!tableType) {
            this.logger.verbose(`ClassDefinition '${classDefinition.name}' does not have a related table type.`);
            return; // not a ClassDefinitionWithTable?
        }

        const tableTypeClassName = classDefinition.name;
        const readerClassName = `${tableTypeClassName}DataReader`;

        const readerClassDefinition: ClassDefinition = {
            implements: ['IEnumerable<SqlDataRecord>'],
            name: readerClassName,
            accessModifier: 'internal',
            xmlDocSummary: [`Creates a forward-only stream of data records from a collection of <see cref="${tableTypeClassName}"/> objects.`]
        };

        this.csharp.writeClassBlock(readerClassDefinition, () => {
            this.csharp.writeLine(`private readonly IEnumerable<${tableTypeClassName}> _collection;`);

            // ctor
            this.csharp.writeLine();
            const ctor: MethodDefinition = { name: readerClassName, accessModifier: 'public', isConstructor: true, parameters: [{ name: 'collection', typeName: `IEnumerable<${tableTypeClassName}>` }] };
            this.csharp.writeMethodBlock(ctor, () => {                
                this.csharp.writeLine('_collection = collection ?? throw new ArgumentNullException(nameof(collection));');                
            });

            // GetEnumerator()
            this.csharp.writeLine();
            const getEnumeratorMethod: MethodDefinition = { name: 'GetEnumerator', accessModifier: 'public', returnTypeName: 'IEnumerator<SqlDataRecord>' };
            // Initialize a SqlDataRecord
            this.csharp.writeMethodBlock(getEnumeratorMethod, () => {
                this.csharp.writeLine('var record = new SqlDataRecord(');
                this.csharp.increaseIndent();
                tableType.ownColumns.forEach((c, i) => {
                    const sqlDbType = SystemDotDataNameMapper.getSqlDbType(c.sqlTypeName);
                    // Only the following are allowed to be passed to the constructor as dbType: Bit, BigInt, DateTime, Decimal, Float, Int, Money, Numeric, SmallDateTime, 
                    // SmallInt, SmallMoney, TimeStamp, TinyInt, UniqueIdentifier, Xml. See https://docs.microsoft.com/en-us/dotnet/api/microsoft.sqlserver.server.sqlmetadata.-ctor?view=netframework-4.8
                    this.csharp.writeIndent();
                    this.csharp.write(`new SqlMetaData("${c.name}", SqlDbType.${sqlDbType}`);
                    // We need to provide the maxLength for some dbTypes, avoiding exceptions like 'The dbType NVarChar is invalid for this constructor.'.
                    // TODO: are there any other types that are invalid?
                    if (sqlDbType === 'NVarChar' || sqlDbType === 'varchar') {
                        this.csharp.write(`, ${c.length || 'SqlMetaData.Max'}`);
                    }
                    this.csharp.write(')');
                    this.csharp.writeEndOfLine(i < tableType.ownColumns.length - 1 ? ',' : undefined);
                });
                this.csharp.decreaseIndent();
                this.csharp.writeLine(');');
                // Fill the SqlDataRecord as we enumerate
                this.csharp.writeLine();
                this.csharp.writeLine('foreach (var item in _collection)');
                this.csharp.writeCodeBlock(() => {
                    tableType.ownColumns.forEach((c, i) => {
                        const propertyName = this.objectNameProvider.getColumnPropertyName({ name: c.name, ordinal: i });
                        const objectTypeName = SqlToCSharpTypeMapper.getCSharpTypeName(c.sqlTypeName) || 'object';
                        const setValueMethod = SystemDotDataNameMapper.getDataRecordSetValueMethod(objectTypeName);
                        this.csharp.writeLine(`record.${setValueMethod}(${i}, item.${propertyName});`);
                    });
                    this.csharp.writeLine('yield return record;');
                });
            });
            // Explicit IEnumerable.GetEnumerator() implementation
            this.csharp.writeLine();
            this.csharp.writeLine('IEnumerator IEnumerable.GetEnumerator() { return GetEnumerator(); }');
        });
    }


    private writeStoredProcedureMethods(storedProcedures: SqlServerStoredProcedure[]): void {
        storedProcedures.forEach(sp => {
            this.writeStoredProcMethod(sp);
            this.csharp.writeLine();
        });
    }

    private writeStoredProcMethod(sp: SqlServerStoredProcedure): void {
        const methodName = this.objectNameProvider.getStoredProcedureMethodName(sp);
        const hasResultSet = sp.resultSets && sp.resultSets.length;
        const resultSetClassName = hasResultSet ? this.objectNameProvider.getStoredProcedureResultSetClassName(sp) : null;

        this.writeExecuteQueryMethod(methodName, resultSetClassName, sp, 'StoredProcedure', false, (commandTextVariable: string, csharp: CSharpWriter) => {
            csharp.writeLine(`var ${commandTextVariable} = "[${sp.schema}].[${sp.name}]";`);
        });
    }

    // #endregion stored procedure data access

    private writeExecuteQueryMethod(
        methodNameOrDefinition: string | MethodDefinition,
        resultSetClassName: string | null,
        q: SqlServerQuery,
        commandType: 'StoredProcedure' | 'Text',
        minifyParamNames: boolean,
        writeCommandText: (commandTextVariable: string, csharp: CSharpWriter) => void,
        beforeWriteCommandParameters?: (commandVariable: string, csharp: CSharpWriter) => void
    ): void {

        let method: MethodDefinition;
        if (typeof (methodNameOrDefinition) === 'string') {
            method = { name: methodNameOrDefinition, accessModifier: 'public' };
        }
        else
            method = methodNameOrDefinition;

        // Are there any result sets?
        const hasResultSet = q.resultSets && q.resultSets.length;
        const hasSingleRecordResultSet = hasResultSet && q.resultSets![0].hasSingleRecord;
        if (hasResultSet) {
            // Note: we do't support multiple result sets at this moment! If we would, the resultSetClassName would still be used,
            // probably with nested IEnumerable<ResultSet1Class>.. IEnumerable<ResultSet2Class> classes.                
            method.returnTypeName = hasSingleRecordResultSet ? resultSetClassName! : `IEnumerable<${resultSetClassName}>`;
        }
        else {
            // Note: identities are returned as output parameter
            method.returnTypeName = 'void';
        }

        const methodParametersBySqlName: Map<string, ParameterDefinition> = new Map<string, ParameterDefinition>();

        const methodParameters: ParameterDefinition[] = method.parameters || [];
        q.parameters.forEach(p => {
            const objectTypeName = p.tableType ? 
                `IEnumerable<${this.objectNameProvider.getTableTypeClassName(p.tableType)}>`:
                p.objectTypeName; // already filled with a standard .NET type by ReverseDbBuilder

            const methodParameter: ParameterDefinition = {
                name: this.objectNameProvider.getParameterName(p),
                typeName: objectTypeName
            };
            methodParameter.isOutput = p.direction === SqlParameterDirection.Output || p.direction === SqlParameterDirection.InputOutput;
            // We don't know if the SP parameter (or the related column, at this moment) is nullable, so allow every input parameter to be null
            methodParameter.isNullable = p.isNullable && !p.isTableValued && SqlToCSharpTypeMapper.canBeNullable(methodParameter.typeName);

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
                if (beforeWriteCommandParameters)
                    beforeWriteCommandParameters('command', this.csharp);

                q.parameters.forEach(p => {
                    this.writeCommandParameter(p, methodParametersBySqlName, minifyParamNames);
                    this.csharp.writeLine();
                });
                this.csharp.writeLine('// Execute');
                this.csharp.writeLine('connection.Open();');
                if (hasResultSet) {
                    this.csharp.writeLine(`var reader = command.ExecuteReader();`);
                    if (hasSingleRecordResultSet) {
                        this.csharp.writeLine('if (!reader.Read()) return null;');
                        this.csharp.writeLine(`var record = ${this.objectNameProvider.getResultSetMapperClassName(resultSetClassName!)}.MapDataRecord(reader);`);
                    }
                    else {
                        this.csharp.writeLine('while (reader.Read())');
                        this.csharp.writeCodeBlock(() => {
                            this.csharp.writeLine(`yield return ${this.objectNameProvider.getResultSetMapperClassName(resultSetClassName!)}.MapDataRecord(reader);`);
                        });
                    }
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
                if (hasSingleRecordResultSet) {
                    this.csharp.writeLine('return record;');
                }
            });
        });
    }

    private writeCommandParameter(p: SqlServerParameter, methodParametersBySqlName: Map<string, ParameterDefinition>, minifyParamNames: boolean): void {
        const methodParameter = methodParametersBySqlName.get(p.name)!;
        const parameterName = minifyParamNames ? DataAccessWriter.minifyParameterName(p) : p.name;
        const variableName = `${methodParameter.name}Parameter`;
        const sqlDbType = p.isTableValued ? 'Structured' : SystemDotDataNameMapper.getSqlDbType(p.sqlTypeName);
        
        this.csharp.writeLine(`// ${p.name}`);
        if (methodParameter.isOutput) {
            // Make a SqlParameter that will contain the output       
            this.csharp.writeLine(`var ${variableName} = new SqlParameter("${parameterName}", SqlDbType.${sqlDbType}) {Direction = ParameterDirection.Output};`);
            this.csharp.writeLine(`command.Parameters.Add(${variableName});`);
            return;
        }

        // The parameter is an input parameter       
        let valueSelector = methodParameter.isNullable ? `${methodParameter.name}.GetValueOrDefault()` : methodParameter.name;
        if (p.tableType) {            
            const tableTypeClassName = this.objectNameProvider.getTableTypeClassName(p.tableType);
            // To send a table-valued parameter with no rows, use a null reference for the value instead.
            valueSelector = `${methodParameter.name} != null ? new ${tableTypeClassName}DataReader(${methodParameter.name}) : null`;
        }

        this.csharp.writeIndent();
        // Initialize the parameter
        this.csharp.write(`var ${variableName} = new SqlParameter("${parameterName}", SqlDbType.${sqlDbType}) {`);        
        this.csharp.write(`Direction = ParameterDirection.Input, Value = ${valueSelector}`);
        if (p.tableType) {
            this.csharp.write(`, TypeName = "${p.tableType.schema}.${p.tableType.name}"`);
        }
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

        // Null check                
        if (!p.isTableValued) { // Table-valued parameters cannot be DBNull, we pass a null reference instead (see above)
            if (methodParameter.isNullable) {
                this.csharp.writeLine(`if (!${methodParameter.name}.HasValue) ${variableName}.Value = DBNull.Value;`);
            }
            else {
                this.csharp.writeLine(`if (${variableName}.Value == null) ${variableName}.Value = DBNull.Value;`);
            }            
        }        
        this.csharp.writeLine(`command.Parameters.Add(${variableName});`);
    }

    private static minifyParameterName(p: SqlServerParameter): string {
        return `@p${p.index}`;
    }
}