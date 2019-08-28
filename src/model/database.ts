/**
 * Represents any database object that has a name and a schema.
 */
export interface NamedDbObject {
    /**
     * Gets the name of the object.
     */
    name: string;
    /**
     * Gets name of the database schema to which the object belongs.
     */
    schema: string;
}

/**
 * Enumerates table constraint types.
 */
export enum DbTableConstraintType {
    PrimaryKey,
    ForeignKey
}

/**
 * Contains a single constraint on a DbTable. 
 */
export interface DbTableConstraint {
    /**
     * Gets the type of constraint.
     */
    constraintType: DbTableConstraintType;

    /**
     * Gets the name of the key, e.g. 'FK_Employee_Department' for a foreign key relationship
     * between Employee and Department, where Department is the primary key base table.
     */
    name: string;

    /**
     * Gets the name of the column.
     */
    columnName: string;

    /**
     * If the key is a foreign key, returns the schema name of the primary key table.
     */
    primaryKeyTableSchema: string | null;

    /**
     * If the key is a foreign key, returns the table name of the primary key table.
     */
    primaryKeyTableName: string | null;

    /**
     * If the key is a foreign key, returns the primary key name of the primary key table.
     */
    primaryKeyColumnName: string | null;    
}

/**
 * Contains meta data about a relational database.
 */
export interface Database<TTable extends DbTable = DbTable> {
    /**
     * Contains meta data about all tables in the database.
     */
    tables: TTable[];
}

/**
 * Contains meta data about a relational database table.
 */
export interface DbTable<TColumn extends DbColumn = DbColumn> extends NamedDbObject {
    // isJunctionTable: boolean; // for future use
    /**
     * Contains all table's columns.
     */
    ownColumns: TColumn[]; 
    /**
     * Contains all the table's constraints.
     */
    constraints: DbTableConstraint[];
}

/**
 * Contains meta data about a relational database column.
 */
export interface DbColumn {
    /**
     * The column name.
     */
    name: string;

    /**
     * The SQL type name.
     */
    sqlTypeName: string;

    /**
     * The maximum size, in bytes, of the data within the column. Set to -1 to specifify a maximum length.
     */
    length: number | null;

    /**
     * The total number of digits to the left and right of the decimal point to which the column value is resolved.
     */
    precision: number | null;

    /**
     * The total number of decimal places to which the column value is resolved.
     */
    scale: number | null;

    /**
     * True if this column is the identity column of the owning table (that is, it contains an auto-incrementing value). 
     */
    isIdentity: boolean;

    /**
     * True if this property is a primary key (that is, it has a constraint that guarantees uniqueness).  
     */
    isPrimaryKey: boolean;

    /**
     * True if this property is a foreign key.  
     */
    isForeignKey: boolean;

    /**
     * True if the column allows null values.
     */
    isNullable: boolean;

    /**
     * True if the column value is readonly because it is auto-generated.
     */
    isReadOnly: boolean;

    /**
     * True if the column value has a default value.
     */
    hasDefaultValue: boolean; 

    /**
     * The table that owns the column.
     */
    table: DbTable;
}

/**
 * Specifies the type of a parameter within a query.
 */
export enum SqlParameterDirection {
    /**
     * The parameter is an input parameter.
     */
    Input = 0,
    /**
     * The parameter is capable of both input and output.
     */
    InputOutput = 1,
    /**
     * The parameter is an output parameter.
     */
    Output = 2,
    /**
     * The parameter represents a return value from an operation such as a stored procedure, built-in function, or user-defined function.
     */
    ReturnValue = 3
}

/**
 * Represents a parameter to a database query.
 */
export interface SqlParameter {
    /**
   * True if the parameter is read only.
   */
    isReadOnly: boolean;

    /**
    * True if the parameter allows NULL values.
    */
    isNullable: boolean;

    /**
     * The parameter name (including a '@').
     */
    name: string;

    /**
     * The 0-based index position of the parameter in a parameter collection.
     */
    index: number;  

    /**
     * Gets the column name to which the parameter is related. 
     */
    columnName: string | null;    

    /**
     * The SQL type name of the parameter. By default, this is the same type name as the related column type. 
     */
    sqlTypeName: string;
   
    /**
     * Gets the name of the object type that matches the parameter's SQL type.
     */
    objectTypeName: string;

    /**
     * The maximum size, in bytes, of the data within the column. Set to -1 to specifify a maximum length.
     */
    length: number | null;

    /**
     * The total number of digits to the left and right of the decimal point to which the parameter value is resolved.
     * The precision is determined by typeName.
     */
    precision: number | null;

    /**
     * The total number of decimal places to which the parameter value is resolved.
     */
    scale: number | null;

    /**
    * Gets or sets a value that indicates whether the parameter is input-only, output-only, bidirectional, or return value parameter.
    */
    direction: SqlParameterDirection;    

    /**
     * Indicates if the parameter relates to an identity column.
     */
    isIdentity: boolean;
}

/**
 * Describes the result set of a SQL query.
 */
export interface SqlResultSet {    
    /**
     * Gets the columns in the result set.
     */
    columns: SqlResultSetColumn[];

    /**
    * True if result set contains no more than 1 record.
    */
    hasSingleRecord?: boolean;
}

/**
 * Describes a "column" inside a SQL result set.
 */
export interface SqlResultSetColumn {
    /**
     * The zero-based column ordinal.
     */
    ordinal: number;
    name?: string;  
    isNullable: boolean;
    /**
     * The SQL type name of the column. 
     */
    sqlTypeName: string | null;

    /**
     * The object type name of the column. 
     */
    objectTypeName: string;
}

/**
 * Contains meta data about a SQL query.
 */
export interface SqlQuery<TParameter = SqlParameter> {
    /**
     * Gets all the query's input- and output parameters.
     */
    parameters: TParameter[]; 

    /**
     * Gets all the query's result sets, if any.
     */
    resultSets?: SqlResultSet[];
}