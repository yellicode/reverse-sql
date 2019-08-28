import { CSharpWriter, MethodDefinition, ParameterDefinition } from '@yellicode/csharp';
import { SqlServerQuery, SqlServerParameter } from '../model/sql-server-database';
import { SqlParameterDirection } from '../model/database';
import { SqlToCSharpTypeMapper } from '../mapper/sql-to-csharp-type-mapper';
import { ReverseSqlObjectNameProvider } from '../mapper/reverse-sql-object-name-provider';
import { SystemDotDataNameMapper } from '../mapper/system-dot-data-name-mapper';

export abstract class QueryMethodWriter {

    constructor(protected csharp: CSharpWriter, protected objectNameProvider: ReverseSqlObjectNameProvider, private connectionStringFieldName: string) {
        
    }

    protected writeExecuteQueryMethod(
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
            this.csharp.writeLine(`using (var connection = new SqlConnection(${this.connectionStringFieldName}))`);
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
        const parameterName = minifyParamNames ? QueryMethodWriter.minifyParameterName(p) : p.name;
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

    protected static minifyParameterName(p: SqlServerParameter): string {
        return `@p${p.index}`;
    }
}