import { SqlServerStoredProcedure, SqlServerTable, SqlResultSet, SqlResultSetColumn } from '@yellicode/sql-server';
import { ClassDefinition, PropertyDefinition } from '@yellicode/csharp';
import { ReverseSqlObjectNameProvider, DefaultReverseSqlObjectNameProvider } from '../mapper/reverse-sql-object-name-provider';
import { SqlToCSharpTypeMapper } from '../mapper/sql-to-csharp-type-mapper';
import { ReverseSqlOptions } from './reverse-sql-options';
import { TableResultSetBuilder } from './table-result-set-builder';
import { ClassDefinitionWithResultSet } from './class-definition-with-result-set';

/**
 * Builds C# class definitions for objects in a database.
 */
export class ReverseSqlClassBuilder {
    private objectNameProvider: ReverseSqlObjectNameProvider;

    constructor(options?: ReverseSqlOptions) {
        const opts = options || {};
        this.objectNameProvider = opts.objectNameProvider || new DefaultReverseSqlObjectNameProvider(opts.includeSchema || false);
    }

    public buildStoredProcResultSetClasses(storedProcedures: SqlServerStoredProcedure[]): ClassDefinition[] {
        // Build C# class and property definitions    
        const classDefinitions: ClassDefinitionWithResultSet[] = [];
        storedProcedures.forEach((sp) => {
            // We only support one result set (using _describe_first_result_set)
            if (!sp.resultSets || !sp.resultSets.length)
                return;
            const resultSet = sp.resultSets[0];

            const classDefinition: ClassDefinitionWithResultSet = { 
                _resultSet: resultSet, name: this.objectNameProvider.getStoredProcedureResultSetClassName(sp), accessModifier: 'public', properties: [] 
            };
            resultSet.columns.forEach((col) => {
                const propertyName = this.objectNameProvider.getResultSetColumnPropertyName(col);

                const property: PropertyDefinition = { name: propertyName, typeName: col.objectTypeName, accessModifier: 'public' };
                property.isNullable = col.isNullable && SqlToCSharpTypeMapper.canBeNullable(col.objectTypeName);

                classDefinition.properties!.push(property);
            });
            classDefinitions.push(classDefinition);
        });

        return classDefinitions;
    }

    public buildTableClasses(tables: SqlServerTable[]): ClassDefinition[] {
         // Build C# class and property definitions    
        const classDefinitions: ClassDefinitionWithResultSet[] = [];
        tables.forEach((table) => {
            const resultSetColumns: SqlResultSetColumn[] = [];
            const classProperties: PropertyDefinition[] = [];

            table.ownColumns.forEach((tc, index) => {
                const propertyName = this.objectNameProvider.getTableColumnPropertyname(tc);
                // Also build a SqlResultSetColumn with mapping information
                const col = TableResultSetBuilder.buildResultSetColumn(tc, index);
                const property: PropertyDefinition = {
                    name: propertyName,
                    typeName: col.objectTypeName,
                    accessModifier: 'public'
                };
                property.isNullable = tc.isNullable && SqlToCSharpTypeMapper.canBeNullable(col.objectTypeName);
                resultSetColumns.push(col);
                classProperties.push(property);
            });
            
            const classDefinition: ClassDefinitionWithResultSet =             { 
                _resultSet: {columns: resultSetColumns},
                name: this.objectNameProvider.getTableClassName(table), 
                accessModifier: 'public', 
                properties: classProperties };

            classDefinitions.push(classDefinition);
        }); 
        return classDefinitions;
    }
}