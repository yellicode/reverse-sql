import { SqlServerParameter } from '../model/sql-server-database';
import { DbColumn } from '../model/database';

export interface SqlServerParameterWithColumn extends SqlServerParameter  {
    _column: DbColumn;
}