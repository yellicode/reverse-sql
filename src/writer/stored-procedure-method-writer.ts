import { QueryMethodWriter } from './query-method-writer';
import { SqlStoredProcedure } from '../model/sql-server-database';
import { CSharpWriter } from '@yellicode/csharp';

export class StoredProcedureMethodWriter extends QueryMethodWriter {
    public writeStoredProcMethod(sp: SqlStoredProcedure): void {
        const methodName = this.objectNameProvider.getStoredProcedureMethodName(sp);
        const hasResultSet = sp.resultSets && sp.resultSets.length;
        const resultSetClassName = hasResultSet ? this.objectNameProvider.getStoredProcedureResultSetClassName(sp) : null;

        this.writeExecuteQueryMethod(methodName, resultSetClassName, sp, null, 'StoredProcedure', false, (commandTextVariable: string, csharp: CSharpWriter) => {
            csharp.writeLine(`var ${commandTextVariable} = "[${sp.schema}].[${sp.name}]";`);
        });
    }
}