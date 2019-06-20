import { SqlServerParameter, SqlServerColumn } from '@yellicode/sql-server';

export interface SqlParameterWithColumn extends SqlServerParameter  {
    _column: SqlServerColumn;
}