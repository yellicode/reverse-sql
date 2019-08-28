import { DbColumn, SqlResultSetColumn } from '../model/database';
import { SqlToCSharpTypeMapper } from '../mapper/sql-to-csharp-type-mapper';

export class TableResultSetBuilder {
    public static buildResultSetColumn(c: DbColumn, index: number): SqlResultSetColumn {
        const col: SqlResultSetColumn = {
            ordinal: index,
            name: c.name,
            // sourceTable: c.table.name,
            // sourceColumn: c.name,
            // isForeignKey: c.isForeignKey,            
            objectTypeName: SqlToCSharpTypeMapper.getCSharpTypeName(c.sqlTypeName) || 'object',
            isNullable: c.isNullable,
            sqlTypeName: c.sqlTypeName,            
        }
        return col;
    }
}