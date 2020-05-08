import { Logger } from '@yellicode/core';
import { ReverseSqlObjectNameProvider } from './mapper/reverse-sql-object-name-provider';
import { ReverseSqlTypeNameProvider } from './mapper/reverse-sql-type-name-provider';

/**
 * Enumerates all supported SQL-Server object types. This is a bitwise enumeration.
 */
export enum BuilderObjectTypes {
    /**
     * The enumeration is uninitialized.
     */
    None = 0,
    /**
     * Generate CRUD methods and C# entities for tables.
     */
    Tables = 1 << 0,
    /**
     * Generate C# entities for user-defined table types and use these as parameters for generated stored procedure calls.
     * If you exclude table types while you have included stored procedures that expect table-valued parameters as
     * input, the generated parameters will be of type `DataTable`.
     */
    TableTypes = 1 << 1,
    /**
     * Generate stored procedure calls.
     */
    StoredProcedures = 1 << 2,
    /**
     * Combines all the other options.
     */
    All = Tables | TableTypes | StoredProcedures
}

/**
 * Contains all reverse-engineering and code generation options.
 */
export interface ReverseSqlOptions {
    /**
     * Indicates what type of objects to include. The default is BuilderObjectTypes.All.
     */
    objectTypes?: BuilderObjectTypes;

    /**
     * A callback function to be run for each stored-procedure. Return true if the stored-procedure must be included.
     */
    storedProcedureFilter?: (schema: string, name: string) => boolean;

    /**
     * A callback function to be run for each table. Return true if the table must be included (meaning: CRUD methods will be generated).
     */
    tableFilter?: (schema: string, name: string) => boolean;

    /**
     * A callback function to be run for each user-defined table type. Return true if the user-defined table type must be included.
     */
    tableTypeFilter?: (schema: string, name: string) => boolean;

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
     * Sets a custom type name provider.
     */
    typeNameProvider?: ReverseSqlTypeNameProvider;

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