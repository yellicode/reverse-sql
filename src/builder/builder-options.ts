import { SqlServerStoredProcedure } from '@yellicode/sql-server';

export enum BuilderObjecTypes {
    None = 0,
    Tables = 1 << 0,
    TableTypes = 1 << 1,
    StoredProcedures = 1 << 2,
    All = Tables | TableTypes | StoredProcedures
}

export interface BuilderOptions {
    /**
     * Indicates what type of objects to include. The default is BuilderObjecTypes.All.
     */
    objectTypes?: BuilderObjecTypes;

    storedProcedureFilter?: (schema: string, name: string) => boolean;
    tableFilter?: (schema: string, name: string) => boolean;
}