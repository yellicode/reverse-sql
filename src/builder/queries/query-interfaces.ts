/**
 * Reference:  
 * 
 * https://docs.microsoft.com/en-us/sql/relational-databases/system-information-schema-views/system-information-schema-views-transact-sql?view=sql-server-2017
 */

export type ParameterMode = 'IN' | 'OUT' | 'INOUT';
export type RoutineType = 'PROCEDURE' | 'FUNCTION';

export interface ObjectResult  {
  SPECIFIC_SCHEMA: string,
  SPECIFIC_NAME: string,
}

export interface StoredProceduresSqlResult extends ObjectResult {
  ROUTINE_TYPE: RoutineType;
}

export interface ParametersSqlResult extends ObjectResult {
  ORDINAL_POSITION: number,
  PARAMETER_MODE: ParameterMode,
  PARAMETER_NAME: string,
  DATA_TYPE: string,
  /**
   * Maximum length in characters for binary or character data types. -1 for xml and large-value type data. Otherwise, returns NULL.
   */
  CHARACTER_MAXIMUM_LENGTH: number | null,
  NUMERIC_PRECISION: number | null;
  NUMERIC_SCALE: number | null,  
  USER_DEFINED_TYPE_SCHEMA : string | null,
  USER_DEFINED_TYPE_NAME: string | null
}

/**
 * Contains some fields from https://docs.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-exec-describe-first-result-set-for-object-transact-sql?view=sql-server-2017
 */
export interface ResultSetSqlResult {
  /**
   * Contains the ordinal position of the column in the result set. The first column's position will be specified as 1.
   */
  column_ordinal: string;  
  /**
   * Contains the name of the column if a name can be determined. Otherwise, it will contain NULL.
   */
  name: string | null; 
  
  /**
   * Contains the result from TYPE_NAME(system_type_id).
   */
  type_name: string | null;
  
  /**
   * Name of the originating table returned by the column in this result. Returns NULL if the table cannot be determined. 
   * Is only populated if browsing information is requested.
   */
  source_table: string | null;
  /**
   * Name of the originating column returned by the column in this result. Returns NULL if the column cannot be determined. Is only populated if browsing information is requested.
   */
  source_column: string | null, 
   /**
   * True if the column allows NULLs, false if the column does not allow NULLs, and true if it cannot be determined if the column allows NULLs.
   */
  is_nullable: boolean;
  /**
   * Indicates that the column is an extra column added for browsing information purposes and that it does not actually appear in the result set.
   */
  is_hidden: boolean;
}

/**
 * The interface for both table- and table type columns.
 */
export interface ColumnsSqlResult extends ObjectResult {
  TABLE_NAME: string,
  TABLE_SCHEMA: string,
  ORDINAL_POSITION: number,
  COLUMN_DEFAULT: string | null,  
  IS_NULLABLE: 'NO' | 'YES'; 
  DATA_TYPE: string;
  CHARACTER_MAXIMUM_LENGTH: number | null;
  NUMERIC_PRECISION: number | null;
  NUMERIC_SCALE: number | null;
  // DATETIME_PRECISION: number | null,
  IS_IDENTITY: boolean;
  IS_ROWGUID_COL: boolean;
  IS_COMPUTED: boolean;
}

export interface ColumnConstraintsSqlResult {
  TABLE_NAME: string;
  TABLE_SCHEMA: string,
  COLUMN_NAME: string;  
  CONSTRAINT_NAME: string;
  CONSTRAINT_TYPE: 'CHECK' | 'UNIQUE' | 'PRIMARY KEY' | 'FOREIGN KEY';
  /**
   * If the constraint is a foreign key constraint, contains 
   * the schema of the primary key table.
   */
  PK_TABLE_SCHEMA: string | null;
  /**
   * If the constraint is a foreign key constraint, contains 
   * the name of the primary key table.
   */
  PK_TABLE_NAME: string | null;
  /**
   * If the constraint is a foreign key constraint, contains 
   * the name of the primary key column.
   */
  PK_COLUMN_NAME: string | null;
}