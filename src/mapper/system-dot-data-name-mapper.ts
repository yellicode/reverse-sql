import * as csharpTypes from './csharp-types';

export class SystemDotDataNameMapper {
    /**
     * Gets the SqlDbType enumeration value that corresponds to the provided sql type name.     
     */
    public static getSqlDbType(sqlType: string): string {
        switch (sqlType) {
            case 'hierarchyid':
                return 'VarChar';
            case 'bigint':
                return 'BigInt';
            case 'binary':
                return 'Binary';
            case 'bit':
                return 'Bit';
            case 'char':
                return 'Char';
            case 'datetime':
                return 'DateTime';
            case 'decimal':
            case 'numeric':
                return 'Decimal';
            case 'float':
                return 'Float';
            case 'image':
                return 'Image';
            case 'int':
                return 'Int';
            case 'money':
                return 'Money';
            case 'nchar':
                return 'NChar';
            case 'ntext':
                return 'NText';
            case 'nvarchar':
                return 'NVarChar';
            case 'real':
                return 'Real';
            case 'uniqueidentifier':
                return 'UniqueIdentifier';
            case 'smalldatetime':
                return 'SmallDateTime';
            case 'smallint':
                return 'SmallInt';
            case 'smallmoney':
                return 'SmallMoney';
            case 'text':
                return 'Text';
            case 'timestamp':
                return 'Timestamp';
            case 'tinyint':
                return 'TinyInt';
            case 'varbinary':
                return 'VarBinary';
            case 'varchar':
                return 'VarChar';
            case 'variant':
                return 'Variant';
            case 'xml':
                return 'Xml';
            case 'udt':
                return 'Udt';
            case 'table type':
            case 'structured':
                return 'Structured';
            case 'date':
                return 'Date';
            case 'time':
                return 'Time';
            case 'datetime2':
                return 'DateTime2';
            case 'datetimeoffset':
                return 'DateTimeOffset';
            default:
                throw `Could not determine the SqlDbType that corresponds to SQL type ${sqlType}.`;
        }
    }

    public static getDataRecordGetValueMethod(csharpTypeName: string): string {
        switch (csharpTypeName) {
            case csharpTypes.STRING:
                return 'GetString';
            case csharpTypes.LONG:
                return 'GetInt64';
            case csharpTypes.SHORT:
                return 'GetInt16'
            case csharpTypes.INT:
                return 'GetInt32';
            case csharpTypes.GUID:
                return 'GetGuid';
            case csharpTypes.DATETIME:
                return 'GetDateTime';            
            case csharpTypes.DOUBLE:
                return 'GetDouble';
            case csharpTypes.FLOAT:
                return 'GetFloat';
            case csharpTypes.DECIMAL:
                return 'GetDecimal';
            case csharpTypes.BYTE:
                return 'GetByte';
            case csharpTypes.BYTE_ARRAY:
                return 'GetBytes';
            case csharpTypes.BOOL:
                return 'GetBoolean';
            case csharpTypes.DBGEOGRAPHY:                
            case csharpTypes.DBGEOMETRY:
            case csharpTypes.HIERARCHYID:
            case csharpTypes.DATETIMEOFFSET:
                return 'GetDateTimeOffset'; // SqlDataReader only
            case csharpTypes.TIMESPAN:
                return 'GetTimeSpan'; // SqlDataReader only
            default:
                return 'GetValue';
        }
    }
}