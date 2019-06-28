import { ReverseSqlObjectNameProvider } from '../reverse-sql';
import { Logger } from '@yellicode/core';

export enum BuilderObjecTypes {
    None = 0,
    Tables = 1 << 0,
    TableTypes = 1 << 1,
    StoredProcedures = 1 << 2,
    All = Tables | TableTypes | StoredProcedures
}

export interface ReverseSqlOptions {
    /**
     * Indicates what type of objects to include. The default is BuilderObjecTypes.All.
     */
    objectTypes?: BuilderObjecTypes;

    storedProcedureFilter?: (schema: string, name: string) => boolean;

    tableFilter?: (schema: string, name: string) => boolean;

     /**
     * Set to true to include schema names for any database object that is not in the 'dbo' schema.
     * The default value is false.
     */
    includeSchema?: boolean;
    
    /**
     * Sets a custom object name provider.
     */
    objectNameProvider?: ReverseSqlObjectNameProvider;
   
    /**
     * When provided, returns a boolan value indicating whether an INSERT method must be generated for the
     * specified table.
     */
    tableInsertMethodFilter?: (schema: string, name: string) => boolean;

    /**
     * When provided, returns a boolan value indicating whether a DELETE method must be generated for the
     * specified table.
     */
    tableDeleteMethodFilter?: (schema: string, name: string) => boolean;

    /**
     * When provided, returns a boolan value indicating whether a UPDATE method must be generated for the
     * specified table.
     */
    tableUpdateMethodFilter?: (schema: string, name: string) => boolean;

    /**
     * When provided, returns a boolan value indicating whether a SELECT method must be generated for the
     * specified table, selecting a record by its primary key.
     */
    tableSelectByPrimaryKeyMethodFilter?: (schema: string, name: string) => boolean;

    /**
     * When provided, returns a boolan value indicating whether a SELECT method must be generated for the
     * specified table, selecting a record using a LINQ expression.
     */
    tableSelectByExpressionMethodFilter?: (schema: string, name: string) => boolean;

    /**
     * Sets an optional logger.
     */
    logger?: Logger;
}