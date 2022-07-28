import { CSharpWriter, MethodDefinition, ParameterDefinition } from '@yellicode/csharp';
import { SqlServerQuery, SqlServerParameter } from '../model/sql-server-database';
import { SqlParameterDirection, SqlParameter } from '../model/database';
import { CSharpReverseSqlTypeNameProvider } from '../mapper/csharp-reverse-sql-type-name-provider';
import { ReverseSqlObjectNameProvider } from '../mapper/reverse-sql-object-name-provider';
import { SystemDotDataNameMapper } from '../mapper/system-dot-data-name-mapper';

export abstract class QueryMethodWriter {

    constructor(protected csharp: CSharpWriter, protected objectNameProvider: ReverseSqlObjectNameProvider, private connectionStringFieldName: string) {

    }

    protected writeExecuteQueryMethod(
        methodNameOrDefinition: string | MethodDefinition,
        resultSetClassName: string | null,
        q: SqlServerQuery,
        fillParametersFromPropertiesOf: string | null,
        commandType: 'StoredProcedure' | 'Text',
        minifyParamNames: boolean,
        writeCommandText: (commandTextVariable: string, csharp: CSharpWriter) => void,
        beforeWriteCommandParameters?: (commandVariable: string, csharp: CSharpWriter) => void,
        inputParameterCondition?: (p: SqlParameter) => string | null
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
                `IEnumerable<${this.objectNameProvider.getTableTypeClassName(p.tableType)}>` :
                p.objectTypeName; // already filled with a standard .NET type by ReverseDbBuilder

            const methodParameter: ParameterDefinition = {
                name: '', // filled below
                typeName: objectTypeName
            };
            methodParameter.isOutput = p.direction === SqlParameterDirection.Output || p.direction === SqlParameterDirection.InputOutput;
            // We don't know if the SP parameter (or the related column, at this moment) is nullable, so allow every input parameter to be null
            methodParameter.isNullable = p.isNullable && !p.isTableValued && CSharpReverseSqlTypeNameProvider.canBeNullable(methodParameter.typeName);
            if (fillParametersFromPropertiesOf) {
                const propertyName = this.objectNameProvider.getColumnPropertyName({ name: p.columnName!, ordinal: p.index });
                methodParameter.name = `${fillParametersFromPropertiesOf}.${propertyName}`;
                methodParametersBySqlName.set(p.name, methodParameter); // reuse this parameter
            }
            else {
                methodParameter.name = this.objectNameProvider.getParameterName(p);
                methodParameters.push(methodParameter); // add a new parameter to the method
            }
            methodParametersBySqlName.set(p.name, methodParameter);
        });

        // Make output parameters show up as last
        method.parameters = methodParameters.sort((a, b) => { return (a.isOutput === b.isOutput) ? 0 : a.isOutput ? 1 : -1; });

        // Write
        this.csharp.writeMethodBlock(method, () => {
            writeCommandText('commandText', this.csharp);
            this.csharp.writeLine();
            // this.csharp.writeLine(`using (var connection = new SqlConnection(${this.connectionStringFieldName}))`);
            // this.csharp.writeLine(`using (var command = new SqlCommand(commandText, connection) { CommandType = CommandType.${commandType} })`);
            this.csharp.writeLine(`using (var connection = this.CreateConnection())`);
            this.csharp.writeLine(`using (var command = CreateCommand(commandText, connection, CommandType.${commandType}))`);
            this.csharp.writeCodeBlock(() => {
                if (beforeWriteCommandParameters)
                    beforeWriteCommandParameters('command', this.csharp);

                q.parameters.forEach(p => {
                    const condition = p.direction === SqlParameterDirection.Input && inputParameterCondition ?
                        inputParameterCondition(p) :
                        null;

                    if (condition) {
                        // Wrap the parameter creation in a "if" (e.g. if (columns.HasFlag(UserColumns.CreatedOn)))
                        this.csharp.writeLine(`if (${condition})`)
                            .writeCodeBlock(() => {
                                this.writeCommandParameter(p, methodParametersBySqlName, minifyParamNames);
                            })
                    }
                    else {
                        this.writeCommandParameter(p, methodParametersBySqlName, minifyParamNames);
                    }
                    this.csharp.writeLine();
                });
                this.csharp.writeLine('// Execute');
                this.csharp.writeLine('connection.Open();');
                if (hasResultSet) {
                    this.csharp.writeLine(`var reader = command.ExecuteReader();`);
                    const mapperClassName = this.objectNameProvider.getResultSetMapperClassName(resultSetClassName!);
                    if (hasSingleRecordResultSet) {
                        this.csharp.writeLine('if (!reader.Read()) return null;');
                        this.csharp.writeLine(`var record = ${mapperClassName}.Create(reader).MapDataRecord(reader);`);
                    }
                    else {
                        this.csharp.writeLine(`var mapper = ${mapperClassName}.Create(reader);`);
                        this.csharp.writeLine('while (reader.Read())');
                        this.csharp.writeCodeBlock(() => {
                            this.csharp.writeLine(`yield return mapper.MapDataRecord(reader);`);
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
                    const variableName = `p${p.index}`;
                    this.csharp.writeLine(`${methodParameter.name} = (${methodParameter.typeName}) ${variableName}.Value;`);
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
        // const variableName = `${methodParameter.name}Parameter`; / /doesn't work anymore, because methodParameter.name can also be 'myTableClass.SomeProperty'
        const variableName = `p${p.index}`;
        const sqlDbType = p.isTableValued ? 'Structured' : SystemDotDataNameMapper.getSqlDbType(p.sqlTypeName);

        this.csharp.writeLine(`// ${p.name}`);
        if (methodParameter.isOutput) {
            // Make a SqlParameter that will contain the output
            // this.csharp.writeLine(`var ${variableName} = new SqlParameter("${parameterName}", SqlDbType.${sqlDbType}) { Direction = ParameterDirection.Output };`);
            this.csharp.writeLine(`var ${variableName} = CreateOutputParameter("${parameterName}", SqlDbType.${sqlDbType});`);
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
        // this.csharp.write(`var ${variableName} = new SqlParameter("${parameterName}", SqlDbType.${sqlDbType}) {`);
        // CreateInputParameter(string parameterName, SqlDbType sqlDbType, object value, string? typeName = null, byte? precision = null, byte? scale = null, int? size = null)
        this.csharp.write(`var ${variableName} = CreateInputParameter("${parameterName}", SqlDbType.${sqlDbType}, ${valueSelector}`);
        this.csharp.write(p.tableType ? `, "${p.tableType.schema}.${p.tableType.name}"`: ', null');        
        this.csharp.write(p.precision || p.scale ? `, ${p.precision}`: ', null');
        this.csharp.write(p.scale ? `, ${p.scale}`: ', null');
        this.csharp.write(p.length ? `, ${p.length}`: ', null');        
        this.csharp.writeEndOfLine(');');

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