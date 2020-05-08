export interface ReverseSqlTypeNameProvider {
    getColumnObjectTypeName(sqlType: string | null, dbObjectName: string | null, columnName: string | null): string | null;
    getParameterObjectTypeName(sqlType: string | null, parameterName: string, dbObjectName: string | null, columnName: string | null): string | null;
}