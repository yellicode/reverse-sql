/**
 * Generates a WhereBuilder class, based on the following implementation:
 *  http://ryanohs.com/2016/04/generating-sql-from-expression-trees-part-2/
 *  Modifications:
 *  - Aligned parameter naming with other generated parameters
 *  - Support IS NULL and IS NOT NULL statements
 *
 *  We don't need to necessarly generate this class the way we do here, a single string with all C# code would suffice.
 *  But: generating it avoids issued with mixed line endings and indentation. And, just because we can...
 */
import { CSharpWriter, ClassDefinition, MethodDefinition } from '@yellicode/csharp';
import { ObjectNameEscaping } from '../reverse-sql-options';

const className = 'WhereBuilder';
const collectionsNamespace = 'System.Collections';
const linqNamespace = 'System.Linq';
const expressionsNamespace = 'System.Linq.Expressions';
const reflectionNamespace = 'System.Reflection';
const compilerServicesNamespace = 'System.Runtime.CompilerServices';

const operators: { [expressionType: string]: string; } = {
    Add: '+',
    And: '&',
    AndAlso: 'AND',
    Divide: '/',
    Equal: '=', // or IS when 'IS NULL'
    ExclusiveOr: '^',
    GreaterThan: '>',
    GreaterThanOrEqual: '>=',
    LessThan: '<',
    LessThanOrEqual: '<=',
    Modulo: '%',
    Multiply: '*',
    Negate: '-',
    Not: 'NOT',
    NotEqual: '<>', // or IS NOT when 'IS NULL'
    Or: '|',
    OrElse: 'OR',
    Subtract: '-',
    Convert: ''    
}

export class WhereBuilderWriter {
    public static write(csharp: CSharpWriter, objectNameEscaping: ObjectNameEscaping): void {
        const classDefinition: ClassDefinition = { name: className, accessModifier: 'internal' };
        csharp.writeClassBlock(classDefinition, () => {
            csharp.writeLine('private readonly IDictionary<string, string> _columnMapping;');
            // Constructor
            csharp.writeLine();
            const ctor: MethodDefinition = { name: className, accessModifier: 'public', isConstructor: true, parameters: [{ name: 'columnMapping', typeName: 'IDictionary<string, string>' }] };
            csharp.writeMethodBlock(ctor, () => {
                csharp.writeLine('_columnMapping = columnMapping;');
            });

            // ToSql
            csharp.writeLine();
            const toSql: MethodDefinition = { name: 'ToSql<T>', returnTypeName: 'WherePart', accessModifier: 'public', parameters: [{ name: 'expression', typeName: `${expressionsNamespace}.Expression<Func<T, bool>>` }] };
            csharp.writeMethodBlock(toSql, () => {
                csharp.writeLine('var i = 0;');
                csharp.writeLine('return Recurse(ref i, expression.Body, isUnary: true);');
            });

            // Recurse
            csharp.writeLine();
            WhereBuilderWriter.writeRecurseMethod(csharp, objectNameEscaping);

            // GetValue
            csharp.writeLine();
            const getValue: MethodDefinition = { name: 'GetValue', returnTypeName: 'object', accessModifier: 'private', parameters: [{ name: 'member', typeName: `${expressionsNamespace}.Expression` }] };
            csharp.writeMethodBlock(getValue, () => {
                // source: http://stackoverflow.com/a/2616980/291955
                csharp.writeLines([
                    'var objectMember = System.Linq.Expressions.Expression.Convert(member, typeof(object));',
                    'var getterLambda = System.Linq.Expressions.Expression.Lambda<Func<object>>(objectMember);',
                    'var getter = getterLambda.Compile();',
                    'return getter();'
                ]);
            });

            csharp.writeLine();
            WhereBuilderWriter.writeNodeTypeToStringMethod(csharp);
            csharp.writeLine();
            WhereBuilderWriter.writeWherePartClass(csharp);
        })
    }

    private static writeRecurseMethod(csharp: CSharpWriter, objectNameEscaping: ObjectNameEscaping): void {
        const recurse: MethodDefinition = {
            name: 'Recurse', returnTypeName: 'WherePart', accessModifier: 'private', parameters: [
                { name: 'i', typeName: `int`, isReference: true },
                { name: 'expression', typeName: `${expressionsNamespace}.Expression` },
                { name: 'isUnary', typeName: 'bool', defaultValue: 'false' },
                { name: 'prefix', typeName: 'string', defaultValue: 'null' },
                { name: 'postfix', typeName: 'string', defaultValue: 'null' },
                { name: 'isRightOperand', typeName: 'bool', defaultValue: 'false' }

            ]
        };
        // UnaryExpression
        csharp.writeMethodBlock(recurse, () => {
            csharp.writeLine(`if (expression is ${expressionsNamespace}.UnaryExpression)`);
            csharp.writeCodeBlock(() => {
                csharp.writeLines([
                    `var unary = (${expressionsNamespace}.UnaryExpression)expression;`,
                    'return WherePart.Concat(NodeTypeToString(unary.NodeType), Recurse(ref i, unary.Operand, true));'
                ])
            });
            // BinaryExpression
            csharp.writeLine(`if (expression is ${expressionsNamespace}.BinaryExpression)`);
            csharp.writeCodeBlock(() => {
                csharp.writeLines([
                    `var body = (${expressionsNamespace}.BinaryExpression)expression;`,
                    'bool valueIsNull = false;', // for correctly generating IS NULL and IS NOT NULL statements
                    `var ce = body.Right as ${expressionsNamespace}.ConstantExpression;`,
                    'if (ce != null && ce.Value == null) valueIsNull = true;',
                    'return WherePart.Concat(Recurse(ref i, body.Left), NodeTypeToString(body.NodeType, valueIsNull), Recurse(ref i, body.Right, false, null, null, true));'
                ])
            });
            // ConstantExpression
            csharp.writeLine(`if (expression is ${expressionsNamespace}.ConstantExpression)`);
            csharp.writeCodeBlock(() => {
                csharp.writeLines([
                    `var constant = (${expressionsNamespace}.ConstantExpression)expression;`,
                    'var value = constant.Value;',
                    'if (value == null) return WherePart.IsNull();',
                    'if (value is int) return WherePart.IsSql(value.ToString());',
                    'if (value is string) value = prefix + (string)value + postfix;',
                    'if (value is bool && isUnary) return WherePart.Concat(WherePart.IsParameter(i++, value), "=", WherePart.IsSql("1"));',
                    'return WherePart.IsParameter(i++, value);'
                ])
            });
            // MemberExpression
            csharp.writeLine(`if (expression is ${expressionsNamespace}.MemberExpression)`);
            csharp.writeCodeBlock(() => {
                csharp.writeLine(`var member = (${expressionsNamespace}.MemberExpression)expression;`);
                csharp.writeLine(`if (member.Member is ${reflectionNamespace}.PropertyInfo)`);
                csharp.writeCodeBlock(() => {
                    csharp.writeLine(`var property = (${reflectionNamespace}.PropertyInfo)member.Member;`);
                    csharp.writeLine('if (!_columnMapping.TryGetValue(property.Name, out var colName))');
                    csharp.writeLineIndented('colName = property.Name;'); // no mapping: assume that the column name is the same as the property name
                    csharp.writeLine('if (isUnary && member.Type == typeof(bool))');
                    csharp.writeLineIndented('return WherePart.Concat(Recurse(ref i, expression), "=", WherePart.IsParameter(i++, true));');
                    // isRightOperand is true if the MemberExpression is the right operand of a BinaryExpression,
                    // e.g. the right part of "LeftClass.Property" = "RightClass.Property"
                    switch (objectNameEscaping) {
                        case ObjectNameEscaping.SqlServer:
                            csharp.writeLine('return isRightOperand ? WherePart.IsParameter(i++, GetValue(member)) : WherePart.IsSql("[" + colName + "]");');
                            break;
                        case ObjectNameEscaping.Ansi:
                            csharp.writeLine('return isRightOperand ? WherePart.IsParameter(i++, GetValue(member)) : WherePart.IsSql(@"" + colName + @"");');
                            break;
                        case ObjectNameEscaping.None:
                            csharp.writeLine('return isRightOperand ? WherePart.IsParameter(i++, GetValue(member)) : WherePart.IsSql(colName);');
                            break;
                    }

                    // csharp.writeLine('return WherePart.IsSql("[" + colName + "]");'); // code before isRightOperand
                });
                csharp.writeLine(`if (member.Member is ${reflectionNamespace}.FieldInfo)`);
                csharp.writeCodeBlock(() => {
                    csharp.writeLine('var value = GetValue(member);');
                    csharp.writeLine('if (value is string)');
                    csharp.writeLineIndented('value = prefix + (string)value + postfix;');
                    csharp.writeLine('return WherePart.IsParameter(i++, value);');
                });
                csharp.writeLine('throw new Exception($"Expression does not refer to a property or field: {expression}");');
            });
            // MethodCallExpression
            csharp.writeLine(`if (expression is ${expressionsNamespace}.MethodCallExpression)`);
            csharp.writeCodeBlock(() => {
                csharp.writeLine(`var methodCall = (${expressionsNamespace}.MethodCallExpression)expression;`);
                // LIKE queries:
                csharp.writeLine('// LIKE queries:');
                csharp.writeLine('if (methodCall.Method == typeof(string).GetMethod("Contains", new[] { typeof(string) }))');
                csharp.writeLineIndented('return WherePart.Concat(Recurse(ref i, methodCall.Object), "LIKE", Recurse(ref i, methodCall.Arguments[0], prefix: "%", postfix: "%"));');
                csharp.writeLine(' if (methodCall.Method == typeof(string).GetMethod("StartsWith", new[] { typeof(string) }))');
                csharp.writeLineIndented('return WherePart.Concat(Recurse(ref i, methodCall.Object), "LIKE", Recurse(ref i, methodCall.Arguments[0], postfix: "%"));');
                csharp.writeLine('if (methodCall.Method == typeof(string).GetMethod("EndsWith", new[] { typeof(string) }))');
                csharp.writeLineIndented('return WherePart.Concat(Recurse(ref i, methodCall.Object), "LIKE", Recurse(ref i, methodCall.Arguments[0], prefix: "%"));');
                // IN queries:
                csharp.writeLine('// IN queries:');
                csharp.writeLine('if (methodCall.Method.Name == "Contains")');
                csharp.writeCodeBlock(() => {
                    csharp.writeLines([`${expressionsNamespace}.Expression collection;`, `${expressionsNamespace}.Expression property;`]);
                    csharp.writeLine(`if (${reflectionNamespace}.CustomAttributeExtensions.IsDefined(methodCall.Method, typeof(${compilerServicesNamespace}.ExtensionAttribute)) && methodCall.Arguments.Count == 2)`);
                    csharp.writeCodeBlock(() => {
                       csharp.writeLines([
                           'collection = methodCall.Arguments[0];',
                           'property = methodCall.Arguments[1];'
                       ])
                    });
                    csharp.writeLine(`else if (!${reflectionNamespace}.CustomAttributeExtensions.IsDefined(methodCall.Method, typeof(${compilerServicesNamespace}.ExtensionAttribute)) && methodCall.Arguments.Count == 1)`);
                    csharp.writeCodeBlock(() => {
                        csharp.writeLines([
                            'collection = methodCall.Object;',
                            'property = methodCall.Arguments[0];'
                        ])
                    });
                    csharp.writeLine('else');
                    csharp.writeLineIndented('throw new Exception("Unsupported method call: " + methodCall.Method.Name);');
                    csharp.writeLine(`var values = (${collectionsNamespace}.IEnumerable)GetValue(collection);`);
                    csharp.writeLine('return WherePart.Concat(Recurse(ref i, property), "IN", WherePart.IsCollection(ref i, values));');
                });
                csharp.writeLine('throw new Exception("Unsupported method call: " + methodCall.Method.Name);');
            })
            csharp.writeLine('throw new Exception("Unsupported expression: " + expression.GetType().Name);');
        });
    }

    private static writeNodeTypeToStringMethod(csharp: CSharpWriter): void {

        const nodeTypeToString: MethodDefinition = {
            name: 'NodeTypeToString', accessModifier: 'private', returnTypeName: 'string', isStatic: true,
            parameters: [{ name: 'nodeType', typeName: `${expressionsNamespace}.ExpressionType` }, {name: 'valueIsNull', typeName: 'bool', defaultValue: 'false'}]
        };

        csharp.writeMethodBlock(nodeTypeToString, () => {
            csharp.writeLine('switch (nodeType)');
            csharp.writeCodeBlock(() => {
                for (const expressionType in operators) {
                    if (operators.hasOwnProperty(expressionType)) {
                        // Example    case System.Linq.Expressions.ExpressionType.Add: return "+";
                        csharp.writeIndent();
                        csharp.write(`case ${expressionsNamespace}.ExpressionType.${expressionType}: `);
                        switch (expressionType) {
                            case 'Equal':
                                csharp.write(`return valueIsNull ? "IS" : "${operators[expressionType]}";`);
                                break;
                            case 'NotEqual':
                                csharp.write(`return valueIsNull ? "IS NOT" : "${operators[expressionType]}";`);
                                break;
                            default:
                                csharp.write(`return "${operators[expressionType]}";`);
                        }
                        csharp.writeEndOfLine();
                    }
                }
            });
            csharp.writeLine('throw new Exception($"Unsupported node type: {nodeType}");');
        });
    }

    private static writeWherePartClass(csharp: CSharpWriter): void {
        const wherePartClass: ClassDefinition = { name: 'WherePart', accessModifier: 'public' };
        csharp.writeClassBlock(wherePartClass, () => {
            csharp.writeLine('public string Sql { get; private set; }');
            csharp.writeLine('public Dictionary<string, object> Parameters { get; private set; }');
            csharp.writeLine();

            // ctor
            const ctor: MethodDefinition = {
                name: 'WherePart', accessModifier: 'public', isConstructor: true,
                parameters: [{ name: 'sql', typeName: 'string' }, { name: 'parameters', typeName: 'Dictionary<string, object>' }]
            };

            csharp.writeMethodBlock(ctor, () => {
                csharp.writeLines(['Sql = sql;', 'Parameters = parameters;']);
            });

            // IsSql method
            const isSql: MethodDefinition = {
                name: 'IsSql', accessModifier: 'public', returnTypeName: 'WherePart', isStatic: true,
                parameters: [{ name: 'sql', typeName: 'string' }] };

            csharp.writeMethodBlock(isSql, () => {
                csharp.writeLine('return new WherePart(sql, new Dictionary<string, object>());');
            });

            // IsParameter method
            const isParameter: MethodDefinition = {
                name: 'IsParameter', accessModifier: 'public', returnTypeName: 'WherePart', isStatic: true,
                parameters: [{ name: 'count', typeName: 'int' }, { name: 'value', typeName: 'object' }] };

            csharp.writeMethodBlock(isParameter, () => {
                  csharp.writeLine('return new WherePart($"@p{count}", new Dictionary<string, object>() {{ $"@p{count}", value }});');
            });

            // IsNull method
            const isNull: MethodDefinition = { name: 'IsNull', accessModifier: 'public', returnTypeName: 'WherePart', isStatic: true};
            csharp.writeMethodBlock(isNull, () => {
                csharp.writeLine('return new WherePart("NULL", new Dictionary<string, object>());');
            });

            // IsCollection method
            const isCollection: MethodDefinition = {
                name: 'IsCollection', accessModifier: 'public', returnTypeName: 'WherePart', isStatic: true,
                parameters: [{ name: 'countStart', typeName: 'int', isReference: true }, { name: 'values', typeName: `${collectionsNamespace}.IEnumerable` }]
            };

            csharp.writeMethodBlock(isCollection, () => {
                csharp.writeLines([
                    'var parameters = new Dictionary<string, object>();',
                    'var sql = new System.Text.StringBuilder("(");',
                    'foreach (var value in values)'
                ]);
                csharp.writeCodeBlock(() => {
                    csharp.writeLines([
                        'parameters.Add($"@p{countStart}", value);',
                        'sql.Append($"@p{countStart},");',
                        'countStart++;'
                    ])
                })
                csharp.writeLine('if (sql.Length == 1)');
                csharp.writeLineIndented('sql.Append("null,");');
                csharp.writeLine('sql[sql.Length - 1] = \')\';');
                csharp.writeLine('return new WherePart(sql.ToString(), parameters);');
            });

            // Concat method
            const concat1: MethodDefinition = {
                name: 'Concat', accessModifier: 'public', returnTypeName: 'WherePart', isStatic: true,
                parameters: [{ name: '@operator', typeName: 'string' }, { name: 'operand', typeName: 'WherePart' }]
            };
            csharp.writeMethodBlock(concat1, () => {
                csharp.writeLine('return new WherePart($"({@operator} {operand.Sql})", operand.Parameters);');
            });

            const concat2: MethodDefinition = {
                name: 'Concat', accessModifier: 'public', returnTypeName: 'WherePart', isStatic: true,
                parameters: [{ name: 'left', typeName: 'WherePart' }, { name: '@operator', typeName: 'string' }, { name: 'right', typeName: 'WherePart' }]
            };
            csharp.writeMethodBlock(concat2, () => {
                csharp.writeLines([
                    `var parameters = ${linqNamespace}.Enumerable.ToDictionary(${linqNamespace}.Enumerable.Union(left.Parameters, right.Parameters), kvp => kvp.Key, kvp => kvp.Value);`,
                    'return new WherePart($"({left.Sql} {@operator} {right.Sql})", parameters);'
                ]);
            });
        });
    }
}