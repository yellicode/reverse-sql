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
 * Sets how table and column names are escaped to avoid using reserved words in SQL statements.
 */
export enum ObjectNameEscaping {
    /**
     * Object names are not escaped.
     */
    None = 0,
    /**
     * Surrounds object names by double quotes as specified in the ANSI/ISO standard.
     */
    Ansi = 1,
    /**
     * Surrounds object names by square brackets. This is the default.
     */
    SqlServer = 1    
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
     * Indicates how table and column names should be escaped. The default is @see ObjectNameEscaping.SqlServer,
     * which escapes names using square brackets.
     */
    objectNameEscaping?: ObjectNameEscaping;

    /**
     * Indicates use of Microsoft.Data.SqlClient instead of System.Data.SqlClient.
     * See https://devblogs.microsoft.com/dotnet/introducing-the-new-microsoftdatasqlclient/
     */
    useMicrosoftDataSqlClient?: boolean;

    /**
     * Sets an optional logger.
     */
    logger?: Logger;
}