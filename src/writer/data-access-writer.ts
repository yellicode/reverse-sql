import { CSharpWriter, ClassDefinition, MethodDefinition, ParameterDefinition } from '@yellicode/csharp';
import { SqlResultSet, DbTable, Database } from '../model/database';
import { SqlStoredProcedure, SqlServerDatabase } from '../model/sql-server-database';
import { ReverseSqlObjectNameProvider, DefaultReverseSqlObjectNameProvider } from '../mapper/reverse-sql-object-name-provider';
import { CSharpReverseSqlTypeNameProvider } from '../mapper/csharp-reverse-sql-type-name-provider';
import { SystemDotDataNameMapper } from '../mapper/system-dot-data-name-mapper';
import { ObjectNameEscaping, ReverseSqlOptions } from '../reverse-sql-options';
import { Logger, ConsoleLogger, LogLevel } from '@yellicode/core';
import { ClassDefinitionWithResultSet, ClassDefinitionWithTable } from '../builder/class-definition-extensions';
import { WhereBuilderWriter } from './where-builder.writer';
import { TableQueryMethodWriter } from './table-query-method-writer';
import { StoredProcedureMethodWriter } from './stored-procedure-method-writer';
import { ReverseSqlClassBuilder } from '../builder/reverse-sql-class-builder';
import { ReverseSqlTypeNameProvider } from '../mapper/reverse-sql-type-name-provider';
import { BYTE_ARRAY } from '../mapper/csharp-types';

const connectionStringFieldName = '_dbConnectionString';

export class DataAccessWriter {
    private objectNameProvider: ReverseSqlObjectNameProvider;
    private typeNameProvider: ReverseSqlTypeNameProvider;
    private tableQueryMethodWriter: TableQueryMethodWriter;
    private storedProcedureMethodWriter: StoredProcedureMethodWriter;
    private classBuilder: ReverseSqlClassBuilder;
    private options: ReverseSqlOptions;
    private logger: Logger;
    private objectNameEscaping: ObjectNameEscaping;

    constructor(private csharp: CSharpWriter, private namespace: string, options?: ReverseSqlOptions) {
        this.options = options || {};

        const objectNameEscaping = this.options.objectNameEscaping == null ? ObjectNameEscaping.SqlServer : this.options.objectNameEscaping;
        
        this.logger = this.options.logger || new ConsoleLogger(console, LogLevel.Info);                
        this.objectNameProvider = this.options.objectNameProvider || new DefaultReverseSqlObjectNameProvider(this.options.includeSchema || false);
        this.typeNameProvider = this.options.typeNameProvider || new CSharpReverseSqlTypeNameProvider();
        this.tableQueryMethodWriter = new TableQueryMethodWriter(csharp, this.objectNameProvider, this.typeNameProvider, objectNameEscaping, connectionStringFieldName);
        this.storedProcedureMethodWriter = new StoredProcedureMethodWriter(csharp, this.objectNameProvider, connectionStringFieldName);
        this.classBuilder = new ReverseSqlClassBuilder(this.options);
        this.objectNameEscaping = objectNameEscaping;
    }

    // #region public methods
    public writeTableClasses(db: Database, includeUsingsAndNamespace?: boolean): void;
    public writeTableClasses(tables: DbTable[], includeUsingsAndNamespace?: boolean): void;
    public writeTableClasses(data: Database | DbTable[], includeUsingsAndNamespace: boolean = false): void {
        const t = Array.isArray(data) ? data : data.tables;
        const classDefinitions = this.classBuilder.buildTableClasses(t);
        const writeFunc = (writer: DataAccessWriter) => {
            writer.csharp.writeLine('#region Table classes');
            writer.writeClassesFromDefinitions(classDefinitions);
            writer.csharp.writeLine('#endregion Table classes');
            writer.csharp.writeLine();
            writer.csharp.writeLine('#region Table class mappers');
            writer.writeDataRecordMapperInterface();
            writer.writeResultSetMappers(classDefinitions);
            writer.csharp.writeLine('#endregion Table class mappers');
            writer.csharp.writeLine();
        }

        if (includeUsingsAndNamespace) {
            this.csharp.writeUsingDirectives('System.Data');
            this.csharp.writeLine();
            this.csharp.writeNamespaceBlock({ name: this.namespace }, () => {
                writeFunc(this);
            });
        }
        else {
            writeFunc(this);
        }
    }

    public writeTableTypeClasses(db: SqlServerDatabase, includeUsingsAndNamespace?: boolean): void;
    public writeTableTypeClasses(tableTypes: DbTable[], includeUsingsAndNamespace?: boolean): void;
    public writeTableTypeClasses(data: SqlServerDatabase | DbTable[], includeUsingsAndNamespace: boolean = false): void {
        const t = Array.isArray(data) ? data : data.tableTypes;
        const classDefinitions = this.classBuilder.buildTableTypeClasses(t);

        const writeFunc = (writer: DataAccessWriter) => {
            writer.csharp.writeLine('#region Table Type classes');
            writer.writeClassesFromDefinitions(classDefinitions);
            writer.csharp.writeLine('#endregion Table Type classes');
            writer.csharp.writeLine();
            writer.csharp.writeLine('#region Table Type data readers');
            writer.writeTableTypeDataReaders(classDefinitions);
            writer.csharp.writeLine('#endregion Table Type data readers');
            writer.csharp.writeLine();
        }

        if (includeUsingsAndNamespace) {
            this.csharp.writeUsingDirectives('System', 'System.Collections', 'System.Collections.Generic', 'System.Data', 
                this.options.useMicrosoftDataSqlClient ? 'Microsoft.Data.SqlClient.Server' : 'Microsoft.SqlServer.Server');
            this.csharp.writeLine();
            this.csharp.writeNamespaceBlock({ name: this.namespace }, () => {
                writeFunc(this);
            });
        }
        else {
            writeFunc(this);
        }
    }

    public writeStoredProcResultSetClasses(db: SqlServerDatabase,  includeUsingsAndNamespace?: boolean): void;
    public writeStoredProcResultSetClasses(storedProcedures: SqlStoredProcedure[], includeUsingsAndNamespace?: boolean): void;
    public writeStoredProcResultSetClasses(data: SqlServerDatabase | SqlStoredProcedure[], includeUsingsAndNamespace: boolean = false): void {
        const sp = Array.isArray(data) ? data : data.storedProcedures;
        const classDefinitions = this.classBuilder.buildStoredProcResultSetClasses(sp);

        const writeFunc = (writer: DataAccessWriter) => {
            this.csharp.writeLine('#region Stored procedure result sets');
            writer.writeClassesFromDefinitions(classDefinitions);
            this.csharp.writeLine('#endregion Stored procedure result sets');
            writer.csharp.writeLine();
            this.csharp.writeLine('#region Stored procedure result set mappers');
            writer.writeResultSetMappers(classDefinitions);
            this.csharp.writeLine('#endregion Stored procedure result set mappers');
            writer.csharp.writeLine();
        }

        if (includeUsingsAndNamespace) {
            this.csharp.writeUsingDirectives('System.Data');
            this.csharp.writeLine();
            this.csharp.writeNamespaceBlock({ name: this.namespace }, () => {
                writeFunc(this);
            });
        }
        else {
            writeFunc(this);
        }
    }

    public writeDatabaseClass(database: SqlServerDatabase, dbClassName: string, includeUsingsAndNamespace: boolean = false): void {
        if (includeUsingsAndNamespace) {
            this.csharp.writeUsingDirectives('System', 'System.Collections.Generic', 'System.Data', 
                this.options.useMicrosoftDataSqlClient ? 'Microsoft.Data.SqlClient' : 'System.Data.SqlClient');
            this.csharp.writeLine();
            this.csharp.writeNamespaceBlock({ name: this.namespace }, () => {
                this.writeDatabaseClassInternal(database, dbClassName);
            });
        }
        else {
            this.writeDatabaseClassInternal(database, dbClassName);
        }
    }

    private writeDatabaseClassInternal(database: SqlServerDatabase, dbClassName: string): void {
        // Database class
        this.csharp.writeLine(`#region ${dbClassName} class`);
        this.csharp.writeClassBlock({ name: dbClassName, accessModifier: 'public', isPartial: true }, () => {
            // Fields
            this.csharp.writeLine(`protected readonly string ${connectionStringFieldName};`);
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
                this.writeTableQueryMethods(database.tables);
                this.csharp.writeLine('#endregion Table data access calls');
            }

            // Abstractions
            this.csharp
                .writeLine()
                .writeLine(`protected virtual IDbConnection CreateConnection() { return new SqlConnection(this.${connectionStringFieldName}); }`);
            this.csharp
                .writeLine()
                .writeLine('protected virtual IDbCommand CreateCommand(string commandText, IDbConnection connection, CommandType commandType) { return new SqlCommand(commandText, (SqlConnection)connection) { CommandType = commandType };}');
            this.csharp
                .writeLine()
                .writeLine('protected virtual IDataParameter CreateOutputParameter(string parameterName, SqlDbType sqlDbType) { return new SqlParameter(parameterName, sqlDbType) { Direction = ParameterDirection.Output }; }');
                this.csharp
                .writeLine()
                .writeLine('protected virtual void AddParameterWithValue(IDataParameterCollection parameters, string parameterName, object value) { ((SqlParameterCollection) parameters).AddWithValue(parameterName, value); }');
            this.csharp
                .writeLine()
                .writeLine('protected virtual IDataParameter CreateInputParameter(string parameterName, SqlDbType sqlDbType, object value, string typeName = null, byte? precision = null, byte? scale = null, int? size = null)')
                .writeCodeBlock(() => {
                    this.csharp
                    .writeLine('var p = new SqlParameter(parameterName, sqlDbType) { Direction = ParameterDirection.Input, Value = value };')
                    .writeLine('if (typeName != null) p.TypeName = typeName;')
                    .writeLine('if (precision.HasValue) p.Precision = precision.Value;')
                    .writeLine('if (scale.HasValue) p.Scale = scale.Value;')
                    .writeLine('if (size.HasValue) p.Size = size.Value;')
                    .writeLine('return p;');
            })

            // Write the WhereBuilder class
            this.csharp.writeLine();
            this.csharp.writeLine('#region Infrastructure');
            WhereBuilderWriter.write(this.csharp, this.objectNameEscaping);
            this.csharp.writeLine('#endregion Infrastructure');
        });
        this.csharp.writeLine(`#endregion ${dbClassName} class`);
    }

    public writeAll(db: SqlServerDatabase, dbClassName: string): void {
        const usingDirectives = ['System', 'System.Collections', 'System.Collections.Generic', 'System.Data',
            this.options.useMicrosoftDataSqlClient ? 'Microsoft.Data.SqlClient' : 'System.Data.SqlClient'];
        if (db.tableTypes && db.tableTypes.length) {
            usingDirectives.push(this.options.useMicrosoftDataSqlClient ? 'Microsoft.Data.SqlClient.Server' : 'Microsoft.SqlServer.Server'); // because of the SqlDataRecord dependency
        }
        this.csharp.writeUsingDirectives(...usingDirectives);
        this.csharp.writeLine();
        this.csharp.writeNamespaceBlock({ name: this.namespace }, () => {
            if (db.storedProcedures && db.storedProcedures.length) {
                this.writeStoredProcResultSetClasses(db);
            }

            if (db.tables && db.tables.length) {
                this.writeTableClasses(db);
            }

            if (db.tableTypes && db.tableTypes.length) {
                this.writeTableTypeClasses(db);
            }

            this.writeDatabaseClass(db, dbClassName);
        });
    }

    public writeUsingDirectivesAndNamespaceBlock(contents: (writer: DataAccessWriter) => void) {
        this.csharp.writeUsingDirectives('System', 'System.Collections.Generic', 'System.Data',
            this.options.useMicrosoftDataSqlClient ? 'Microsoft.Data.SqlClient' : 'System.Data.SqlClient');
        this.csharp.writeLine();
        this.csharp.writeNamespaceBlock({ name: this.namespace }, () => {
            contents(this);
        });
    }

    //public writeResultSetMappers()

    // #endregion public methods

    private writeDataRecordMapperInterface(): void {
        this.csharp
            .writeLine('internal interface IDataRecordMapper<T>')
            .writeLine('{')
            .writeLineIndented(' T MapDataRecord(IDataRecord dataRecord);')            
            .writeLine('}');
    }

    private writeResultSetMappers(resultSetClasses: ClassDefinition[]): void {
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

        const cs = this.csharp;

        const mapperClassDefinition: ClassDefinition = {
            name: this.objectNameProvider.getResultSetMapperClassName(classDefinition.name),
            accessModifier: 'internal',
            xmlDocSummary: [`Maps <see cref="IDataRecord"/> objects to <see cref="${classDefinition.name}"/> objects.`],
            implements: [`IDataRecordMapper<${classDefinition.name}>`]
        };

        cs.writeClassBlock(mapperClassDefinition, () => {
            // Fields
            cs.writeLine('private readonly int[] _indices;');
            // Constructor
            const ctorParameter: ParameterDefinition = {name: 'indices', typeName: 'int[]'};
            const ctor: MethodDefinition = { name: mapperClassDefinition.name, isConstructor: true, accessModifier: 'private', parameters: [ctorParameter]};
            cs.writeLine();
            cs.writeMethodBlock(ctor, () => {
                cs.writeLine(`_indices = ${ctorParameter.name};`);
            })

            // Factory method
            const dataReaderParameter: ParameterDefinition = { name: 'dataReader', typeName: 'IDataReader' };
            const factoryMethod: MethodDefinition = {name: 'Create',  accessModifier: 'public', isStatic: true, returnTypeName: mapperClassDefinition.name, parameters: [dataReaderParameter]};
            cs.writeLine();
            cs.writeMethodBlock(factoryMethod, () => {
                cs.writeLine('int[] indices = {');
                cs.increaseIndent();
                resultSet.columns.forEach(c => {
                    cs.writeLine(`dataReader.GetOrdinal("${c.name}"),`);
                })
                cs.decreaseIndent();
                cs.writeLine('};');
                cs.writeLine(`return new ${mapperClassDefinition.name}(indices);`);
            });

            // Mapper method
            const dataRecordParameter: ParameterDefinition = { name: 'dataRecord', typeName: 'IDataRecord' };
            const mapDataRecordMethod: MethodDefinition = { name: 'MapDataRecord', accessModifier: 'public', isStatic: false, returnTypeName: classDefinition.name, parameters: [dataRecordParameter] };
            cs.writeLine();
            cs.writeMethodBlock(mapDataRecordMethod, () => {
                cs.writeLine(`if (${dataRecordParameter.name} == null) return null;`);
                cs.writeLine(`var result = new ${classDefinition.name}();`);
                resultSet.columns.forEach((c, index) => {
                    cs.writeLine(`if (_indices[${index}] > -1 && !dataRecord.IsDBNull(_indices[${index}]))`);
                    cs.writeCodeBlock(() => {
                        const propertyName = this.objectNameProvider.getColumnPropertyName(c);
                        const getValueMethod = SystemDotDataNameMapper.getDataRecordGetValueMethod(c.objectTypeName);
                        // Exclude GetBytes() because has a different signature than other methods.
                        // TODO: generate GetBytes(int i, long fieldOffset, byte[] buffer, int bufferoffset, int length) call.
                        if (getValueMethod && c.objectTypeName !== BYTE_ARRAY)
                            cs.writeLine(`result.${propertyName} = dataRecord.${getValueMethod}(_indices[${index}]);`);
                        else {
                            // The column is mapped to an unknown type (most likely a custom enum). Cast the value.
                            cs.writeLine(`result.${propertyName} = (${c.objectTypeName}) dataRecord.GetValue(_indices[${index}]);`);
                        }
                    });
                });
                cs.writeLine('return result;');
            });
        });
    }

    private writeTableTypeDataReader(classDefinition: ClassDefinition, tableType: DbTable): void {
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
                        const objectTypeName = this.typeNameProvider.getColumnObjectTypeName(c.sqlTypeName, c.table.name, c.name) || 'object';
                        const setValueMethod = SystemDotDataNameMapper.getDataRecordSetValueMethod(objectTypeName);
                        if (setValueMethod) {
                            this.csharp.writeLine(`record.${setValueMethod}(${i}, item.${propertyName});`);
                        }
                        else
                            this.csharp.writeLine(`record.SetValue(${i}, item.${propertyName});`);

                    });
                    this.csharp.writeLine('yield return record;');
                });
            });
            // Explicit IEnumerable.GetEnumerator() implementation
            this.csharp.writeLine();
            this.csharp.writeLine('IEnumerator IEnumerable.GetEnumerator() { return GetEnumerator(); }');
        });
    }

    private writeTableTypeDataReaders(tableTypeClasses: ClassDefinition[]): void {
        tableTypeClasses.forEach(cd => {
            this.writeTableTypeDataReader(cd, (cd as ClassDefinitionWithTable)._table);
        })
    }

    private writeClassesFromDefinitions(classes: ClassDefinition[]): void {
        classes.forEach(c => {
            this.csharp.writeClassBlock(c, () => {
                c.properties!.forEach(p => {
                    this.csharp.writeAutoProperty(p);
                })
            });
            this.csharp.writeLine();
        });
    }

    // #region queries

    private writeTableQueryMethods(tables: DbTable[]): void {
        tables.forEach(t => {
            // const primaryKey = t.ownColumns.find(c => c.isPrimaryKey); // we could use the PKs, but this will result in a confusing method signature if there are multiple PKs
            const idColumn = t.ownColumns.find(c => c.isIdentity);

            // Insert
            if (!this.options.tableInsertMethodFilter || this.options.tableInsertMethodFilter(t.schema!, t.name)) {
                this.tableQueryMethodWriter.writeTableInsertMethods(t);
                this.csharp.writeLine();
            }
            if (idColumn) {
                // Delete (by PK)
                if (!this.options.tableDeleteMethodFilter || this.options.tableDeleteMethodFilter(t.schema!, t.name)) {
                    this.tableQueryMethodWriter.writeTableDeleteMethod(t, idColumn);
                    this.csharp.writeLine();
                }
                // Update (by PK)
                if (!this.options.tableUpdateMethodFilter || this.options.tableUpdateMethodFilter(t.schema!, t.name)) {
                    this.tableQueryMethodWriter.writeTableUpdateMethods(t);
                    this.csharp.writeLine();
                }
                // Select (by PK)
                if (!this.options.tableSelectByPrimaryKeyMethodFilter || this.options.tableSelectByPrimaryKeyMethodFilter(t.schema!, t.name)) {
                    this.tableQueryMethodWriter.writeTableSelectByPrimaryKeyMethod(t);
                    this.csharp.writeLine();
                }
            }
            else {
                this.logger.warn(`Cannot generate Delete, Get and Update methods for table '${t.schema}.${t.name}' because the table has no identity column.`);
            }

            // SelectWhere
            if (!this.options.tableSelectByExpressionMethodFilter || this.options.tableSelectByExpressionMethodFilter(t.schema!, t.name)) {
                this.tableQueryMethodWriter.writeTableSelectByExpressionMethod(t);
                this.csharp.writeLine();
            }
        });
    }

    private writeStoredProcedureMethods(storedProcedures: SqlStoredProcedure[]): void {
        storedProcedures.forEach(sp => {
            this.storedProcedureMethodWriter.writeStoredProcMethod(sp);
            this.csharp.writeLine();
        });
    }

    // #endregion queries
}