import { SqlServerStoredProcedure, SqlResultSetColumn, SqlParameter } from '@yellicode/sql-server';
import { isReservedKeyword } from '@yellicode/csharp';
import { NameUtility } from '@yellicode/templating';

export interface ReverseSqlObjectNameProvider {
    
    /**
     * Returns the name to be generated for the result set of a stored procedure.     
     */
    getResultSetClassName(sp: SqlServerStoredProcedure): string;

    /**
     * Returns the name to be generated for the mapper class that maps
     * data records to result set classes.     
     */
    getResultSetMapperClassName(resultSetClassName: string): string;

    /**
    * Returns the property name to be generated for a column in a result set.     
    */
    getResultSetColumnPropertyName(col: SqlResultSetColumn): string;

    /**
     * Returns the method name to be generate for the method call to the 
     * specified stored procedure.     
     */
    getStoredProcedureMethodName(sp: SqlServerStoredProcedure): string;

    /**
     * Returns the .NET parameter name to be generated for the 
     * specified SQL parameter.     
     */
    getParameterName(parameter: SqlParameter): string;
}

export class DefaultReverseSqlObjectNameProvider implements ReverseSqlObjectNameProvider {
    constructor(protected includeSchemaName: boolean = false) {

    }


    private static cleanup(input: string): string {
        if (!input) return '';

        // Remove non-word characters
        let result = input.replace(/[^\w]/g, '');
        return result;
    }

    public getResultSetClassName(sp: SqlServerStoredProcedure): string {
        const cleanedUpSpName = DefaultReverseSqlObjectNameProvider.cleanup(sp.name);
        if (this.includeSchemaName && sp.schemaName && sp.schemaName !== 'dbo') {
            const cleanedUpSchemaName = DefaultReverseSqlObjectNameProvider.cleanup(sp.schemaName);
            return `${cleanedUpSchemaName}_${cleanedUpSpName}Result`;
        }
        else return `${cleanedUpSpName}Result`;
    }

    public getResultSetMapperClassName(resultSetClassName: string): string {
        return `${resultSetClassName}Mapper`;
    }

    public getResultSetColumnPropertyName(col: SqlResultSetColumn): string {
        if (!col.name) return `Column${col.ordinal}`;
        return DefaultReverseSqlObjectNameProvider.cleanup(col.name);
    }

    public getStoredProcedureMethodName(sp: SqlServerStoredProcedure): string {
        const cleanedUpSpName = DefaultReverseSqlObjectNameProvider.cleanup(sp.name);
        if (this.includeSchemaName && sp.schemaName && sp.schemaName !== 'dbo') {
            const cleanedUpSchemaName = DefaultReverseSqlObjectNameProvider.cleanup(sp.schemaName);
            return `${cleanedUpSchemaName}_${cleanedUpSpName}`;
        }
        else return cleanedUpSpName;
    }

    public getParameterName(parameter: SqlParameter): string {        
        let name = parameter.name.startsWith('@') ? parameter.name.slice(1) : parameter.name;
        name = DefaultReverseSqlObjectNameProvider.cleanup(name);        
        name = NameUtility.upperToLowerCamelCase(name);
        if (isReservedKeyword(name)){
            name = `@${name}`;
        }
        return name;
    }   
}