import { CSharpWriter, ClassDefinition, MethodDefinition, ParameterDefinition } from '@yellicode/csharp';
import { SqlServerStoredProcedure, SqlParameterDirection, SqlServerParameter, SqlServerDatabase, SqlServerQuery } from '@yellicode/sql-server';
import { ReverseSqlObjectNameProvider } from '../mapper/reverse-sql-object-name-provider';
import { SqlToCSharpTypeMapper } from '../mapper/sql-to-csharp-type-mapper';
import { SystemDotDataNameMapper } from '../mapper/system-dot-data-name-mapper';

const connectionStringFieldName = '_dbConnectionString';

export class DataAccessWriter {

    constructor(private csharp: CSharpWriter, private objectNameProvider: ReverseSqlObjectNameProvider) {

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
            this.csharp.writeLine();
            this.writeStoredProcedureCalls(database.storedProcedures);
        });
    }

    public writeResultSetDataRecordMappers(storedProcedures: SqlServerStoredProcedure[], resultSetClasses: ClassDefinition[]): void {
        storedProcedures.forEach(sp => {
            if (!sp.resultSets || !sp.resultSets.length) return;

            const resultSet = sp.resultSets[0];

            // Find the corresponding result set class
            const resultSetClassName = this.objectNameProvider.getResultSetClassName(sp);
            const resultSetCassDefinition = resultSetClasses.find(cd => cd.name === resultSetClassName);
            if (!resultSetCassDefinition) {
                // TODO: use logger
                console.warn(`Unable to find result set class definition named '${resultSetClassName}'.`);
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

    private writeStoredProcedureCalls(storedProcedures: SqlServerStoredProcedure[]): void {
        storedProcedures.forEach(sp => {
            this.writeStoredProcedureCall(sp);
        });
    }

    private writeStoredProcedureCall(sp: SqlServerStoredProcedure): void {
        const methodName = this.objectNameProvider.getStoredProcedureMethodName(sp);     
        const commandStatement = `"[${sp.schema}].[${sp.name}]"`;
        const hasResultSet = sp.resultSets && sp.resultSets.length;
        const resultSetClassName = hasResultSet ? this.objectNameProvider.getResultSetClassName(sp): null;

        this.writeQueryCall(methodName, resultSetClassName, sp, commandStatement, 'StoredProcedure');
    }

    private writeQueryCall(
        methodName: string, 
        resultSetClassName: string | null,
        q: SqlServerQuery, 
        commandStatement: string,         
        commandType: 'StoredProcedure' | 'Text'): void {

        const method: MethodDefinition = { name: methodName, accessModifier: 'public' };
        let returnTypeName: string;

        // Are there any result sets?        
        const hasResultSet = q.resultSets && q.resultSets.length;
        if (hasResultSet) {            
            returnTypeName = `IEnumerable<${resultSetClassName}>`;
        }
        else {            
            returnTypeName = 'void';
        }
        method.returnTypeName = returnTypeName;

        const methodParametersBySqlName: Map<string, ParameterDefinition> = new Map<string, ParameterDefinition>();

        const methodParameters: ParameterDefinition[] = [];
        q.parameters.forEach(p => {
            const methodParameter: ParameterDefinition = {
                name: this.objectNameProvider.getParameterName(p),
                typeName: p.objectTypeName
            };
            methodParameter.isOutput = p.direction === SqlParameterDirection.Output || p.direction === SqlParameterDirection.InputOutput;
            // We don't know if the SP parameter (or the related column) is nullable, so allow every input parameter to be null
            methodParameter.isNullable = p.isNullable && SqlToCSharpTypeMapper.canBeNullable(methodParameter.typeName);
            methodParameters.push(methodParameter);
            methodParametersBySqlName.set(p.name, methodParameter);
        });

        method.parameters = methodParameters;
        // Write          
        this.csharp.writeMethodBlock(method, () => {
            this.csharp.writeLine(`using (var connection = new SqlConnection(${connectionStringFieldName}))`);
            this.csharp.writeLine(`using (var command = new SqlCommand(${commandStatement}, connection) { CommandType = CommandType.${commandType} })`);
            this.csharp.writeCodeBlock(() => {
                q.parameters.forEach(p => {
                    this.writeCommandParameter(p, methodParametersBySqlName);
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

    private writeCommandParameter(p: SqlServerParameter, methodParametersBySqlName: Map<string, ParameterDefinition>): void {
        const methodParameter = methodParametersBySqlName.get(p.name)!;
        const variableName = `${methodParameter.name}Parameter`;
        const sqlDbType = p.isTableValued ? 'Structured' : SystemDotDataNameMapper.getSqlDbType(p.sqlTypeName);
        // console.log(`getFromSqlType for ${p.typeName} returned ${sqlDbType}`);
        this.csharp.writeLine(`// ${p.name}`);
        if (methodParameter.isOutput) {
            // Make a SqlParameter that will contain the output                                
            this.csharp.writeLine(`var ${variableName} = new SqlParameter("${p.name}", SqlDbType.${sqlDbType}) {Direction = ParameterDirection.Output};`);
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
        this.csharp.write(`var ${variableName} = new SqlParameter("${p.name}", SqlDbType.${sqlDbType}) {`);
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
}