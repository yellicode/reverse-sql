import { DbColumn, SqlResultSetColumn } from '../model/database';

export class TableResultSetBuilder {
    public static buildResultSetColumn(c: DbColumn, index: number, objectTypeName: string | null): SqlResultSetColumn {
        const col: SqlResultSetColumn = {
            ordinal: index,
            name: c.name,
            // sourceTable: c.table.name,
            // sourceColumn: c.name,
            // isForeignKey: c.isForeignKey,
            // objectTypeName: SqlToCSharpTypeMapper.getCSharpTypeName(c.sqlTypeName) || 'object',
            objectTypeName: objectTypeName || 'object',
            isNullable: c.isNullable,
            sqlTypeName: c.sqlTypeName,
        }
        return col;
    }
}