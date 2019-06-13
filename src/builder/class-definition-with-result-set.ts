import { SqlResultSet } from '@yellicode/sql-server';
import { ClassDefinition } from '@yellicode/csharp';

export interface ClassDefinitionWithResultSet extends ClassDefinition {
    _resultSet: SqlResultSet;
}