import { SqlServerStoredProcedure, SqlResultSetColumn, SqlParameter, SqlServerQuery, SqlServerTable, NamedObject, SqlServerColumn } from '@yellicode/sql-server';
import { isReservedKeyword } from '@yellicode/csharp';
import { NameUtility } from '@yellicode/core';

export interface ReverseSqlObjectNameProvider {

    /**
     * Returns the name to be generated for the result set of a stored procedure.     
     */
    getStoredProcedureResultSetClassName(sp: SqlServerStoredProcedure): string;

    /**
     * Returns the name to be generated for the result set of a table SELECT.
     */
    getTableSelectResultSetClassName(table: SqlServerTable): string;

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
     * Gets a .NET method name that is generated for inserting data into the 
     * specified table.     
     */
    getTableInsertMethodName(table: SqlServerTable): string;

    /**
     * Gets a .NET method name that is generated for deleting data from the 
     * specified table.     
     */
    getTableDeleteMethodName(table: SqlServerTable): string;

    /**
    * Gets a .NET method name that is generated for updating data in the 
    * specified table.     
    */
    getTableUpdateMethodName(table: SqlServerTable): string;

    /**
     * Gets a .NET method name that is generated for selecting data from the 
     * specified table by its primary key.     
     */
    getTableSelectByPrimaryKeyMethodName(table: SqlServerTable): string;

    /**
     * Returns the .NET parameter name to be generated for the 
     * specified SQL parameter.     
     */
    getParameterName(parameter: SqlParameter): string;

}

export class DefaultReverseSqlObjectNameProvider implements ReverseSqlObjectNameProvider {
    constructor(protected includeSchema: boolean = false) {

    }


    private static cleanup(input: string): string {
        if (!input) return '';

        // Remove non-word characters
        let result = input.replace(/[^\w]/g, '');
        return result;
    }

    public getStoredProcedureResultSetClassName(sp: SqlServerStoredProcedure): string {
        const cleanedUpSpName = DefaultReverseSqlObjectNameProvider.cleanup(sp.name);
        if (this.includeSchema && sp.schema && sp.schema !== 'dbo') {
            const cleanedUpSchemaName = DefaultReverseSqlObjectNameProvider.cleanup(sp.schema);
            return `${cleanedUpSchemaName}_${cleanedUpSpName}Result`;
        }
        else return `${cleanedUpSpName}Result`;
    }

    public getTableSelectResultSetClassName(table: SqlServerTable): string {
        const cleanedUpTableName = DefaultReverseSqlObjectNameProvider.cleanup(table.name);
        if (this.includeSchema && table.schema && table.schema !== 'dbo') {
            const cleanedUpSchemaName = DefaultReverseSqlObjectNameProvider.cleanup(table.schema);
            return `Select${cleanedUpSchemaName}_${cleanedUpTableName}Result`;
        }
        else return `Select${cleanedUpTableName}Result`;
    }

    public getResultSetMapperClassName(resultSetClassName: string): string {
        return `${resultSetClassName}Mapper`;
    }

    public getResultSetColumnPropertyName(col: SqlResultSetColumn): string {
        if (!col.name) return `Column${col.ordinal}`;
        return DefaultReverseSqlObjectNameProvider.cleanup(col.name);
    }
    
    // public getTableColumnProperyName(col: SqlServerColumn): string {
    //     if (!col.name) return `Column${col.ordinal}`;
    //     return DefaultReverseSqlObjectNameProvider.cleanup(col.name);
    // }

    public getStoredProcedureMethodName(sp: SqlServerStoredProcedure): string {
        return this.getCleanObjectNameWithSchema(sp);
    }

    public getTableInsertMethodName(table: SqlServerTable): string {
        // Format: "dbo_InsertMyType"
        return this.getCleanObjectNameWithSchema({ schema: table.schema, name: `Insert${NameUtility.capitalize(table.name)}` });
    }

    public getTableDeleteMethodName(table: SqlServerTable): string {
        // Format: "dbo_DeleteMyType"
        return this.getCleanObjectNameWithSchema({ schema: table.schema, name: `Delete${NameUtility.capitalize(table.name)}` });
    }

    public getTableUpdateMethodName(table: SqlServerTable): string {
        // Format: "dbo_UpdateMyType"
        return this.getCleanObjectNameWithSchema({ schema: table.schema, name: `Update${NameUtility.capitalize(table.name)}` });
    }

    public getTableSelectByPrimaryKeyMethodName(table: SqlServerTable): string {
        // Format: "dbo_SelectMyType"
        return this.getCleanObjectNameWithSchema({ schema: table.schema, name: `Select${NameUtility.capitalize(table.name)}` });
    }

    protected getCleanObjectNameWithSchema(object: { schema?: string, name: string }): string {
        let result: string;
        const cleanedUpName = DefaultReverseSqlObjectNameProvider.cleanup(object.name);
        if (this.includeSchema && object.schema && object.schema !== 'dbo') {
            const cleanedUpSchema = NameUtility.capitalize(DefaultReverseSqlObjectNameProvider.cleanup(object.schema));
            result = `${cleanedUpSchema}_${cleanedUpName}`;
        }
        else result = cleanedUpName;
        return result;
    }

    public getParameterName(parameter: SqlParameter): string {
        let name = parameter.name.startsWith('@') ? parameter.name.slice(1) : parameter.name;
        name = DefaultReverseSqlObjectNameProvider.cleanup(name);
        name = NameUtility.upperToLowerCamelCase(name);
        if (isReservedKeyword(name)) {
            name = `@${name}`;
        }
        return name;
    }
}