import { SqlResultSet, Table } from '@yellicode/sql-server';
import { ClassDefinition } from '@yellicode/csharp';

export interface ClassDefinitionWithResultSet extends ClassDefinition {
    _resultSet: SqlResultSet;
}

export interface ClassDefinitionWithTable extends ClassDefinition {
    _table: Table;
}