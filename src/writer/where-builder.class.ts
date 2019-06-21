export const whereBuilderClass: string = `
            private readonly IDictionary<string, string> _columnMapping;

public WhereBuilder(IDictionary<string, string> columnMapping)
{
    _columnMapping = columnMapping;
}

public WherePart ToSql<T>(System.Linq.Expressions.Expression<Func<T, bool>> expression)
{
    var i = 0;
    return Recurse(ref i, expression.Body, isUnary: true);
}

private WherePart Recurse(ref int i, System.Linq.Expressions.Expression expression, bool isUnary = false, string prefix = null, string postfix = null)
{
    if (expression is System.Linq.Expressions.UnaryExpression)
    {
        var unary = (System.Linq.Expressions.UnaryExpression)expression;
        return WherePart.Concat(NodeTypeToString(unary.NodeType), Recurse(ref i, unary.Operand, true));
    }
    if (expression is System.Linq.Expressions.BinaryExpression)
    {
        var body = (System.Linq.Expressions.BinaryExpression)expression;
        bool valueIsNull; // for correctly generating IS NULL and IS NOT NULL statements
        var ce = body.Right as System.Linq.Expressions.ConstantExpression;
        if (ce != null && ce.Value == null)
        {
            valueIsNull = true;
        }
        else valueIsNull = false;
        return WherePart.Concat(Recurse(ref i, body.Left), NodeTypeToString(body.NodeType, valueIsNull), Recurse(ref i, body.Right));
    }
    if (expression is System.Linq.Expressions.ConstantExpression)
    {
        var constant = (System.Linq.Expressions.ConstantExpression)expression;
        var value = constant.Value;
        if (value == null)
        {
            return WherePart.IsNull();
        }
        if (value is int)
        {
            return WherePart.IsSql(value.ToString());
        }
        if (value is string)
        {
            value = prefix + (string)value + postfix;
        }
        if (value is bool && isUnary)
        {
            return WherePart.Concat(WherePart.IsParameter(i++, value), "=", WherePart.IsSql("1"));
        }
        return WherePart.IsParameter(i++, value);
    }
    if (expression is System.Linq.Expressions.MemberExpression)
    {
        var member = (System.Linq.Expressions.MemberExpression)expression;

        if (member.Member is System.Reflection.PropertyInfo)
        {
            var property = (System.Reflection.PropertyInfo)member.Member;
            if (!_columnMapping.TryGetValue(property.Name, out var colName))
            {
                colName = property.Name; // assume that the column name is the same as the property name
            }
            if (isUnary && member.Type == typeof(bool))
            {
                return WherePart.Concat(Recurse(ref i, expression), "=", WherePart.IsParameter(i++, true));
            }
            return WherePart.IsSql("[" + colName + "]");
        }
        if (member.Member is System.Reflection.FieldInfo)
        {
            var value = GetValue(member);
            if (value is string)
            {
                value = prefix + (string)value + postfix;
            }
            return WherePart.IsParameter(i++, value);
        }
        throw new Exception($"Expression does not refer to a property or field: {expression}");
    }
    if (expression is System.Linq.Expressions.MethodCallExpression)
    {
        var methodCall = (System.Linq.Expressions.MethodCallExpression)expression;
        // LIKE queries:
        if (methodCall.Method == typeof(string).GetMethod("Contains", new[] { typeof(string) }))
        {
            return WherePart.Concat(Recurse(ref i, methodCall.Object), "LIKE", Recurse(ref i, methodCall.Arguments[0], prefix: "%", postfix: "%"));
        }
        if (methodCall.Method == typeof(string).GetMethod("StartsWith", new[] { typeof(string) }))
        {
            return WherePart.Concat(Recurse(ref i, methodCall.Object), "LIKE", Recurse(ref i, methodCall.Arguments[0], postfix: "%"));
        }
        if (methodCall.Method == typeof(string).GetMethod("EndsWith", new[] { typeof(string) }))
        {
            return WherePart.Concat(Recurse(ref i, methodCall.Object), "LIKE", Recurse(ref i, methodCall.Arguments[0], prefix: "%"));
        }
        // IN queries:
        if (methodCall.Method.Name == "Contains")
        {
            System.Linq.Expressions.Expression collection;
            System.Linq.Expressions.Expression property;
            if (System.Reflection.CustomAttributeExtensions.IsDefined(methodCall.Method, typeof(System.Runtime.CompilerServices.ExtensionAttribute)) && methodCall.Arguments.Count == 2)
            {
                collection = methodCall.Arguments[0];
                property = methodCall.Arguments[1];
            }
            else if (!System.Reflection.CustomAttributeExtensions.IsDefined(methodCall.Method, typeof(System.Runtime.CompilerServices.ExtensionAttribute)) && methodCall.Arguments.Count == 1)
            {
                collection = methodCall.Object;
                property = methodCall.Arguments[0];
            }
            else
            {
                throw new Exception("Unsupported method call: " + methodCall.Method.Name);
            }
            var values = (System.Collections.IEnumerable)GetValue(collection);
            return WherePart.Concat(Recurse(ref i, property), "IN", WherePart.IsCollection(ref i, values));
        }
        throw new Exception("Unsupported method call: " + methodCall.Method.Name);
    }
    throw new Exception("Unsupported expression: " + expression.GetType().Name);
}

private static object GetValue(System.Linq.Expressions.Expression member)
{
    // source: http://stackoverflow.com/a/2616980/291955
    var objectMember = System.Linq.Expressions.Expression.Convert(member, typeof(object));
    var getterLambda = System.Linq.Expressions.Expression.Lambda<Func<object>>(objectMember);
    var getter = getterLambda.Compile();
    return getter();
}

private static string NodeTypeToString(System.Linq.Expressions.ExpressionType nodeType, bool valueIsNull = false)
{
    switch (nodeType)
    {
        case System.Linq.Expressions.ExpressionType.Add:
            return "+";
        case System.Linq.Expressions.ExpressionType.And:
            return "&";
        case System.Linq.Expressions.ExpressionType.AndAlso:
            return "AND";
        case System.Linq.Expressions.ExpressionType.Divide:
            return "/";
        case System.Linq.Expressions.ExpressionType.Equal:
            return valueIsNull ? "IS" : "=";
        case System.Linq.Expressions.ExpressionType.ExclusiveOr:
            return "^";
        case System.Linq.Expressions.ExpressionType.GreaterThan:
            return ">";
        case System.Linq.Expressions.ExpressionType.GreaterThanOrEqual:
            return ">=";
        case System.Linq.Expressions.ExpressionType.LessThan:
            return "<";
        case System.Linq.Expressions.ExpressionType.LessThanOrEqual:
            return "<=";
        case System.Linq.Expressions.ExpressionType.Modulo:
            return "%";
        case System.Linq.Expressions.ExpressionType.Multiply:
            return "*";
        case System.Linq.Expressions.ExpressionType.Negate:
            return "-";
        case System.Linq.Expressions.ExpressionType.Not:
            return "NOT";
        case System.Linq.Expressions.ExpressionType.NotEqual:
            return valueIsNull ? "IS NOT" : "<>";
        case System.Linq.Expressions.ExpressionType.Or:
            return "|";
        case System.Linq.Expressions.ExpressionType.OrElse:
            return "OR";
        case System.Linq.Expressions.ExpressionType.Subtract:
            return "-";
    }
    throw new Exception($"Unsupported node type: {nodeType}");
}

public class WherePart
{
    public string Sql { get; set; }
    public Dictionary<string, object> Parameters { get; set; } = new Dictionary<string, object>();

    public static WherePart IsSql(string sql)
    {
        return new WherePart()
        {
            Parameters = new Dictionary<string, object>(),
            Sql = sql
        };
    }

    public static WherePart IsParameter(int count, object value)
    {
        return new WherePart()
        {
            Parameters = { { $"@p{count}", value } },
            Sql = $"@p{count}"
        };
    }

    public static WherePart IsNull()
    {
        return new WherePart()
        {
            Parameters = new Dictionary<string, object>(),
            Sql = "NULL"
        };
    }

    public static WherePart IsCollection(ref int countStart, System.Collections.IEnumerable values)
    {
        var parameters = new Dictionary<string, object>();
        var sql = new System.Text.StringBuilder("(");
        foreach (var value in values)
        {
            parameters.Add($"@p{countStart}", value);
            sql.Append($"@p{countStart},");
            countStart++;
        }
        if (sql.Length == 1)
        {
            sql.Append("null,");
        }
        sql[sql.Length - 1] = ')';
        return new WherePart()
        {
            Parameters = parameters,
            Sql = sql.ToString()
        };
    }

    public static WherePart Concat(string @operator, WherePart operand)
    {
        return new WherePart()
        {
            Parameters = operand.Parameters,
            Sql = $"({@operator} {operand.Sql})"
        };
    }

    public static WherePart Concat(WherePart left, string @operator, WherePart right)
    {
        return new WherePart()
        {
            Parameters = System.Linq.Enumerable.ToDictionary(System.Linq.Enumerable.Union(left.Parameters, right.Parameters), kvp => kvp.Key, kvp => kvp.Value),
            Sql = $"({left.Sql} {@operator} {right.Sql})"
        };
    }
}`;