import * as csharpTypes from './csharp-types';
import { ReverseSqlTypeNameProvider } from './reverse-sql-type-name-provider';

export class CSharpReverseSqlTypeNameProvider implements ReverseSqlTypeNameProvider {

    public static canBeNullable(csTypeName: string): boolean {
        switch (csTypeName) {
            // the following can NOT be nullable:
            case 'string':
            case 'System.String':
            case 'object':
            case 'System.Object':
            case 'DataTable':
            case 'System.Data.DataTable':
            case 'byte[]':
            case 'System.Data.Entity.Spatial.DbGeography':
            case 'System.Data.Entity.Spatial.DbGeometry':
                return false;
            default:
                return true;
        }
    }

    protected getObjectTypeName(sqlType: string | null): string | null {
        if (!sqlType)
            return null;

        const lower = sqlType.toLowerCase();

        switch (lower) {
            case 'nvarchar':
            case 'varchar':
            case 'char':
            case 'xml':
            case 'text':
                return csharpTypes.STRING;
            case 'hierarchyid':
                return csharpTypes.HIERARCHYID;
            case 'bigint':
                return csharpTypes.LONG;
            case 'smallint':
                return csharpTypes.SHORT;
            case 'int':
                return csharpTypes.INT;
            case 'uniqueidentifier':
                return csharpTypes.GUID;
            case 'smalldatetime':
            case 'datetime':
            case 'datetime2':
            case 'date':
                return csharpTypes.DATETIME;
            case 'datetimeoffset':
                return csharpTypes.DATETIMEOFFSET;
            case 'table type':
                return csharpTypes.DATATABLE;
            case 'time':
                return csharpTypes.TIMESPAN;
            case 'float':
                return csharpTypes.DOUBLE;
            case 'real':
                return csharpTypes.FLOAT;
            case 'numeric':
            case 'smallmoney':
            case 'decimal':
            case 'money':
                return csharpTypes.DECIMAL;
            case 'tinyint':
                return csharpTypes.BYTE;
            case 'bit':
                return csharpTypes.BOOL;
            case 'image':
            case 'binary':
            case 'varbinary':
            case 'varbinary(max)':
            case 'timestamp':
                return csharpTypes.BYTE_ARRAY;
            case 'geography':
                return csharpTypes.DBGEOGRAPHY;
            case 'geometry':
                return csharpTypes.DBGEOMETRY;
            default:
                return null;
        }
    }

    public getColumnObjectTypeName(sqlType: string | null, dbObjectName: string | null, columnName: string | null): string | null {
        return this.getObjectTypeName(sqlType);
    }

    public getParameterObjectTypeName(sqlType: string | null, parameterName: string, dbObjectName: string | null, columnName: string | null): string | null {
        return this.getObjectTypeName(sqlType);
    }
}