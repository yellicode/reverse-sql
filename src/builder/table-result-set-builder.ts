import { SqlServerColumn, SqlResultSetColumn } from '@yellicode/sql-server';
import { SqlToCSharpTypeMapper } from '../mapper/sql-to-csharp-type-mapper';

export class TableResultSetBuilder {
    public static buildResultSetColumn( c: SqlServerColumn, index: number): SqlResultSetColumn {
        const col: SqlResultSetColumn = {
            ordinal: index,
            name: c.name,
            sourceColumn: c.name,
            objectTypeName: SqlToCSharpTypeMapper.getCSharpTypeName(c.sqlTypeName) || 'object',
            sourceTable: c.table.name,
            isNullable: c.isNullable,
            isForeignKey: c.isForeignKey,
            isJoined: false,
            sqlTypeName: c.sqlTypeName,
            parentColumn: null,
        }
        return col;
    }    
}