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

/**
 * Get SQL table information.
 */
export const tablesSql = `
  SELECT
    o.object_id,
    o.type,
    s.name AS [schema],
    o.name,
    ISNULL(c.identity_count, 0) AS [identity_count]
  FROM
    sys.objects o
    JOIN sys.schemas s ON o.schema_id = s.schema_id
    LEFT JOIN (
      SELECT
        i.object_id,
        count(1) AS [identity_count]
      FROM
        sys.identity_columns i
      GROUP BY
        i.object_id
    ) c on c.object_id = o.object_id
  where
    o.type = 'U'
    AND o.is_ms_shipped = 0
  ORDER BY
    s.name,
    o.name
`;

/**
 * Get SQL column information.
 */
export const columnsSql = `
  SELECT
    c.object_id,
    c.name,
    tp.name AS [datatype],
    tp.is_user_defined,
    c.max_length,
    c.is_computed,
    c.precision,
    c.scale AS [scale],
    c.collation_name,
    c.is_nullable,
    dc.definition,
    ic.is_identity,
    ic.seed_value,
    ic.increment_value,
    cc.definition AS [formula]
  FROM
    sys.columns c
    JOIN sys.types tp ON c.user_type_id = tp.user_type_id
    LEFT JOIN sys.computed_columns cc ON c.object_id = cc.object_id AND c.column_id = cc.column_id
    LEFT JOIN sys.default_constraints dc ON
      c.default_object_id != 0
      AND c.object_id = dc.parent_object_id
      AND c.column_id = dc.parent_column_id
    LEFT JOIN sys.identity_columns ic ON
      c.is_identity = 1
      AND c.object_id = ic.object_id
      AND c.column_id = ic.column_id
`;

/**
 * Get SQL primary key information.
 */
export const primaryKeysSql = `
  SELECT
    c.object_id,
    ic.is_descending_key,
    k.name,
    c.name AS [column],
    CASE
      WHEN ic.index_id = 1 THEN 'CLUSTERED'
      WHEN ic.index_id > 1 THEN 'NONCLUSTERED'
      ELSE 'HEAP'
    END as [type]
  FROM
    sys.index_columns ic
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    LEFT JOIN sys.key_constraints k ON k.parent_object_id = ic.object_id
  WHERE
    ic.is_included_column = 0
    AND ic.index_id = k.unique_index_id
    AND k.type = 'PK'
`;

/**
 * Get SQL foreign key information.
 */
export const foreignKeysSql = `
  SELECT
    po.object_id,
    k.constraint_object_id,
    fk.is_not_trusted,
    c.name AS [column],
    rc.name AS [reference],
    fk.name,
    SCHEMA_NAME(po.schema_id) AS [schema],
    po.name AS [table],
    SCHEMA_NAME(ro.schema_id) AS [parent_schema],
    ro.name AS [parent_table],
    fk.delete_referential_action,
    fk.update_referential_action
  FROM
    sys.foreign_key_columns k
    JOIN sys.columns rc ON rc.object_id = k.referenced_object_id AND rc.column_id = k.referenced_column_id
    JOIN sys.columns c ON c.object_id = k.parent_object_id AND c.column_id = k.parent_column_id
    JOIN sys.foreign_keys fk ON fk.object_id = k.constraint_object_id
    JOIN sys.objects ro ON ro.object_id = fk.referenced_object_id
    JOIN sys.objects po ON po.object_id = fk.parent_object_id
`;


/**
 * Get SQL information for user defined types.
 */
export const typesSql = `
  SELECT
    o.object_id,
    o.type,
    s.name AS [schema],
    t.name,
    TYPE_NAME(t.system_type_id) as [system_type],
    t.max_length,
    t.precision,
    t.scale,
    t.is_nullable
  FROM
    sys.types t
    LEFT JOIN sys.table_types tt ON tt.user_type_id = t.user_type_id
    LEFT JOIN sys.objects o ON o.object_id = tt.type_table_object_id
    JOIN sys.schemas s ON t.schema_id = s.schema_id
  WHERE
    t.is_user_defined = 1
  ORDER BY
    s.name,
    o.name
`;

/**
 * Get SQL information for procs, triggers, functions, etc.
 */
export const objectsSql = `
  SELECT
    so.name,
    s.name AS [schema],
    so.type AS [type],
    STUFF
    (
      (
        SELECT
          CAST(sc_inner.text AS varchar(max))
        FROM
          sys.objects so_inner
          INNER JOIN syscomments sc_inner ON sc_inner.id = so_inner.object_id
          INNER JOIN sys.schemas s_inner ON s_inner.schema_id = so_inner.schema_id
        WHERE
          so_inner.name = so.name
          AND s_inner.name = s.name
        FOR XML PATH(''), TYPE
      ).value('(./text())[1]', 'varchar(max)')
      ,1
      ,0
      ,''
    ) AS [text]
  FROM
    sys.objects so
    INNER JOIN syscomments sc ON sc.id = so.object_id AND so.type in ('P', 'V', 'TF', 'IF', 'FN', 'TR')
    INNER JOIN sys.schemas s ON s.schema_id = so.schema_id
  GROUP BY
    so.name,
    s.name,
    so.type
`;