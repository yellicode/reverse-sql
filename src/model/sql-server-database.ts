import { Database, DbTable, SqlParameter, SqlResultSet, NamedDbObject, SqlQuery } from './database';

/**
 * Contains meta data about a SQL server database.
 */
export interface SqlServerDatabase extends Database {
    /**
     * Contains all SQL-Server User Defined Table Types.
     */
    tableTypes: DbTable[];

    /**
     * Gets all stored procedures in the database model.
     */
    storedProcedures: SqlStoredProcedure[];
}

/**
 * Extends the SqlParameter type with data about a SQL Server user-defined table type.
 */
export interface SqlServerParameter extends SqlParameter {

    /**
     * True if the parameter is a table valued parameter.
     */
    isTableValued: boolean;

    /**
     * Gets the table type in case the parameter is table-valued.
     */
    tableType: DbTable | null;
}

/**
 * Contains meta data about a SQL server query.
 */
export interface SqlServerQuery extends SqlQuery<SqlServerParameter> {   
    
}

/**
 * Represents a SQL server stored procedure.
 */
export interface SqlStoredProcedure extends SqlServerQuery, NamedDbObject {

}