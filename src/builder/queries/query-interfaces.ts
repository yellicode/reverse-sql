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
  // DATETIME_PRECISION: number | null,
  /**
   * The full name of the user defined type ({USER_DEFINED_TYPE_SCHEMA}.{USER_DEFINED_TYPE_NAME})
   */
  USER_DEFINED_TYPE: string | null
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

// /**
//  * Base SQL object.
//  */
// export interface AbstractSqlObject {
//   object_id: number;
//   type: string;
//   schema: string;
//   name: string;
// }

// /**
//  * SQL schema object.
//  */
// export interface SqlSchema {
//   name: string;
// }

// /**
//  * SQL data results.
//  */
// export interface SqlDataResult {
//   name: string;
//   hasIdentity: number;
//   result: sql.IResult<any>;
// }

// /**
//  * SQL table object.
//  */
// export interface SqlTable extends AbstractSqlObject {
//   identity_count: number;
// }

// /**
//  * SQL type.
//  */
// export interface SqlType extends AbstractSqlObject {
//   system_type: string;
//   max_length: number;
//   precision: number;
//   scale: boolean;
//   is_nullable: boolean;
// }

// /**
//  * SQL column object.
//  */
// export interface SqlColumn {
//   object_id: number;
//   name: string;
//   datatype: string;
//   is_user_defined: boolean;
//   max_length: number;
//   is_computed: boolean;
//   precision: number;
//   scale: string;
//   collation_name: string;
//   is_nullable: boolean;
//   definition: string;
//   is_identity: boolean;
//   seed_value: number;
//   increment_value: number;
//   formula: string;
// }

// /**
//  * SQL primary key object.
//  */
// export interface SqlPrimaryKey {
//   object_id: number;
//   is_descending_key: boolean;
//   name: string;
//   column: string;
//   type: 'CLUSTERED' | 'NONCLUSTERED' | 'HEAP';
// }

// /**
//  * SQL foreign key object.
//  */
// export interface SqlForeignKey {
//   object_id: number;
//   constraint_object_id: number;
//   is_not_trusted: boolean;
//   column: string;
//   reference: string;
//   name: string;
//   schema: string;
//   table: string;
//   parent_schema: string;
//   parent_table: string;
//   delete_referential_action: number;
//   update_referential_action: number;
// }

// /**
//  * SQL index object.
//  */
// export interface SqlIndex {
//   object_id: number;
//   index_id: number;
//   is_descending_key: boolean;
//   is_included_column: boolean;
//   is_unique: boolean;
//   name: string;
//   column: string;
//   schema: string;
//   table: string;
// }

// /**
//  * SQL object.
//  */
// export interface SqlObject extends AbstractSqlObject {
//   text: string;
// }