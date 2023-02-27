import { SqlResultSetColumn, DbTable } from '../model/database';
import { SqlStoredProcedure } from '../model/sql-server-database';
import { ClassDefinition, PropertyDefinition } from '@yellicode/csharp';
import { ReverseSqlObjectNameProvider, DefaultReverseSqlObjectNameProvider } from '../mapper/reverse-sql-object-name-provider';
import { CSharpReverseSqlTypeNameProvider } from '../mapper/csharp-reverse-sql-type-name-provider';
import { ReverseSqlOptions } from '../reverse-sql-options';
import { TableResultSetBuilder } from './table-result-set-builder';
import { ClassDefinitionWithResultSet, ClassDefinitionWithTable } from './class-definition-extensions';
import { ReverseSqlTypeNameProvider } from '../mapper/reverse-sql-type-name-provider';

/**
 * Builds C# class definitions for objects in a database.
 */
export class ReverseSqlClassBuilder {
    private objectNameProvider: ReverseSqlObjectNameProvider;
    private typeNameProvider: ReverseSqlTypeNameProvider;

    constructor(options?: ReverseSqlOptions) {
        const opts = options || {};
        this.objectNameProvider = opts.objectNameProvider || new DefaultReverseSqlObjectNameProvider(opts.includeSchema || false);
        this.typeNameProvider = opts.typeNameProvider || new CSharpReverseSqlTypeNameProvider();
    }

    public buildStoredProcResultSetClasses(storedProcedures: SqlStoredProcedure[]): ClassDefinition[] {
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
                const propertyName = this.objectNameProvider.getColumnPropertyName(col);

                const property: PropertyDefinition = { name: propertyName, typeName: col.objectTypeName, accessModifier: 'public' };
                property.isNullable = col.isNullable && CSharpReverseSqlTypeNameProvider.canBeNullable(col.objectTypeName);

                classDefinition.properties!.push(property);
            });
            classDefinitions.push(classDefinition);
        });

        return classDefinitions;
    }

    public buildTableClasses(tables: DbTable[]): ClassDefinition[] {
        const classDefinitions: ClassDefinitionWithResultSet[] = [];
        tables.forEach((table) => {
            const resultSetColumns: SqlResultSetColumn[] = [];
            const classProperties: PropertyDefinition[] = [];

            table.ownColumns.forEach((tc, index) => {
                const propertyName = this.objectNameProvider.getColumnPropertyName({ name: tc.name, ordinal: index });
                // Also build a SqlResultSetColumn with mapping information
                const col = TableResultSetBuilder.buildResultSetColumn(tc, index, this.typeNameProvider.getColumnObjectTypeName(tc.sqlTypeName, table.name, tc.name));
                const property: PropertyDefinition = {
                    name: propertyName,
                    typeName: col.objectTypeName,
                    accessModifier: 'public'
                };
                property.isNullable = tc.isNullable && CSharpReverseSqlTypeNameProvider.canBeNullable(col.objectTypeName);
                resultSetColumns.push(col);
                classProperties.push(property);
            });

            const classDefinition: ClassDefinitionWithResultSet = {
                _resultSet: { columns: resultSetColumns },
                name: this.objectNameProvider.getTableClassName(table),
                accessModifier: 'public',
                properties: classProperties,                
                isPartial: true
            };

            classDefinitions.push(classDefinition);
        });
        return classDefinitions;
    }

    public buildTableTypeClasses(tableType: DbTable[]): ClassDefinition[] {
        const classDefinitions: ClassDefinitionWithTable[] = [];
        tableType.forEach((tt) => {
            const classProperties: PropertyDefinition[] = [];

            tt.ownColumns.forEach((tc, index) => {
                const propertyName = this.objectNameProvider.getColumnPropertyName({ name: tc.name, ordinal: index });
                const typeName = this.typeNameProvider.getColumnObjectTypeName(tc.sqlTypeName, tt.name, tc.name) || 'object';
                const property: PropertyDefinition = {
                    name: propertyName,
                    typeName: typeName,
                    accessModifier: 'public'
                };
                property.isNullable = tc.isNullable && CSharpReverseSqlTypeNameProvider.canBeNullable(typeName);
                classProperties.push(property);
            });

            const classDefinition: ClassDefinitionWithTable = {
                _table: tt,
                name: this.objectNameProvider.getTableTypeClassName(tt),
                accessModifier: 'public',
                properties: classProperties
            };

            classDefinitions.push(classDefinition);
        });
        return classDefinitions;
    }
}