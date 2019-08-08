/**
 * Selects stored procedures and table valued functions.
 */
export const storedProceduresSql = `
  SELECT  R.SPECIFIC_SCHEMA,
          R.SPECIFIC_NAME,
          R.ROUTINE_TYPE      
  FROM    INFORMATION_SCHEMA.ROUTINES R      
  WHERE   R.ROUTINE_TYPE = 'PROCEDURE'     
          AND R.SPECIFIC_SCHEMA + R.SPECIFIC_NAME IN (
              SELECT  SCHEMA_NAME(sp.schema_id) + sp.name
              FROM    sys.all_objects AS sp
                      LEFT OUTER JOIN sys.all_sql_modules AS sm
                          ON sm.object_id = sp.object_id
              WHERE   sp.type = 'P'
                      AND (CAST(CASE WHEN sp.is_ms_shipped = 1 THEN 1
                                    WHEN (
                                          SELECT major_id
                                          FROM   sys.extended_properties
                                          WHERE  major_id = sp.object_id
                                                  AND minor_id = 0
                                                  AND class = 1
                                                  AND name = N'microsoft_database_tools_support'
                                          ) IS NOT NULL THEN 1
                                    ELSE 0
                                END AS BIT) = 0))

  UNION ALL
  SELECT  R.SPECIFIC_SCHEMA,
          R.SPECIFIC_NAME,
          R.ROUTINE_TYPE     

  FROM    INFORMATION_SCHEMA.ROUTINES R       
  WHERE   R.ROUTINE_TYPE = 'FUNCTION'
          AND R.DATA_TYPE = 'TABLE'
`;

export const parametersSql = `
  SELECT P.SPECIFIC_SCHEMA,
  P.SPECIFIC_NAME,
  P.ORDINAL_POSITION,
      P.PARAMETER_MODE,
      P.PARAMETER_NAME,
      P.DATA_TYPE,
      ISNULL(P.CHARACTER_MAXIMUM_LENGTH, 0) AS CHARACTER_MAXIMUM_LENGTH,
      ISNULL(P.NUMERIC_PRECISION, 0) AS NUMERIC_PRECISION,
      ISNULL(P.NUMERIC_SCALE, 0) AS NUMERIC_SCALE,
      ISNULL(P.DATETIME_PRECISION, 0) AS DATETIME_PRECISION,
      P.USER_DEFINED_TYPE_SCHEMA + '.' + P.USER_DEFINED_TYPE_NAME AS USER_DEFINED_TYPE 
      FROM INFORMATION_SCHEMA.PARAMETERS P

  WHERE P.IS_RESULT = 'NO' OR P.IS_RESULT IS NULL                               
`;

export const tableColumnsSql = `SELECT
c.TABLE_SCHEMA AS SPECIFIC_SCHEMA,
c.COLUMN_NAME AS SPECIFIC_NAME,
c.TABLE_NAME,
c.TABLE_SCHEMA,
c.ORDINAL_POSITION,
c.COLUMN_DEFAULT,
c.IS_NULLABLE,
c.DATA_TYPE,
c.CHARACTER_MAXIMUM_LENGTH,
c.NUMERIC_PRECISION,
c.NUMERIC_SCALE,
c.DATETIME_PRECISION,		
sc.is_identity AS IS_IDENTITY,
sc.is_rowguidcol AS IS_ROWGUID_COL,
sc.is_computed AS IS_COMPUTED
FROM
INFORMATION_SCHEMA.COLUMNS c

INNER JOIN sys.schemas AS ss ON c.TABLE_SCHEMA = ss.[name]
LEFT OUTER JOIN sys.tables AS st ON st.schema_id = ss.schema_id AND st.[name] = c.TABLE_NAME
LEFT OUTER JOIN sys.views AS sv ON sv.schema_id = ss.schema_id AND sv.[name] = c.TABLE_NAME
INNER JOIN sys.all_columns AS sc ON sc.object_id = COALESCE( st.object_id, sv.object_id ) AND c.COLUMN_NAME = sc.[name]

WHERE c.TABLE_NAME NOT IN ('EdmMetadata', '__MigrationHistory', '__RefactorLog', 'sysdiagrams')

ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`;

export const tableTypeColumnsSql = `SELECT      
schema_name(tt.schema_id) AS SPECIFIC_SCHEMA  
,sc.name AS SPECIFIC_NAME
,tt.name AS TABLE_NAME
,schema_name(tt.schema_id) AS TABLE_SCHEMA  
,ROW_NUMBER() OVER(ORDER BY sc.column_id) As ORDINAL_POSITION
,c.text as COLUMN_DEFAULT
,CASE WHEN sc.is_nullable = 1 THEN 'YES' ELSE 'NO' END AS IS_NULLABLE
,st.name AS DATA_TYPE
,sc.max_length AS CHARACTER_MAXIMUM_LENGTH
,sc.precision AS NUMERIC_PRECISION
,sc.scale AS NUMERIC_SCALE  
,NULL AS DATETIME_PRECISION -- TODO
,sc.is_identity AS IS_IDENTITY
,sc.is_rowguidcol AS IS_ROWGUID_COL
,sc.is_computed AS IS_COMPUTED
 
FROM sys.table_types tt
INNER JOIN sys.columns sc on sc.object_id = tt.type_table_object_id
INNER JOIN sys.types st on st.user_type_id = sc.user_type_id
LEFT JOIN sys.objects o ON o.parent_object_id = sc.object_id AND sc.default_object_id = o.object_id
LEFT JOIN sys.syscomments c on c.id = o.object_id
WHERE tt.is_user_defined = 1 AND tt.is_table_type = 1
ORDER BY sc.object_id, column_id`;

export const columnConstraintsSql = `SELECT DISTINCT
u1.TABLE_SCHEMA,
u1.TABLE_NAME,
u1.COLUMN_NAME,
u1.CONSTRAINT_NAME,
tc.CONSTRAINT_TYPE,
u2.TABLE_SCHEMA PK_TABLE_SCHEMA,
u2.TABLE_NAME AS PK_TABLE_NAME,
u2.COLUMN_NAME AS PK_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE u1
INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc ON
    u1.TABLE_SCHEMA COLLATE DATABASE_DEFAULT = tc.CONSTRAINT_SCHEMA COLLATE DATABASE_DEFAULT
    AND u1.TABLE_NAME = tc.TABLE_NAME AND u1.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
LEFT JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
	ON rc.CONSTRAINT_NAME COLLATE DATABASE_DEFAULT = u1.CONSTRAINT_NAME COLLATE DATABASE_DEFAULT
LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE u2
	ON u2.CONSTRAINT_NAME COLLATE DATABASE_DEFAULT = rc.UNIQUE_CONSTRAINT_NAME COLLATE DATABASE_DEFAULT`;