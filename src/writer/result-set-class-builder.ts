import { SqlServerStoredProcedure } from '@yellicode/sql-server';
import { ClassDefinition, PropertyDefinition } from '@yellicode/csharp';
import { ReverseSqlObjectNameProvider } from '../mapper/reverse-sql-object-name-provider';
import { SqlToCSharpTypeMapper } from '../mapper/sql-to-csharp-type-mapper';

export class ResultSetClassBuilder {    
    constructor(private objectNameProvider: ReverseSqlObjectNameProvider) {        
        
    }

    public buildClassDefinitions(storedProcedures: SqlServerStoredProcedure[]): ClassDefinition[] {
        // Build C# class and property definitions    
        const classDefinitions: ClassDefinition[] = [];
        storedProcedures.forEach((sp) => {
            // We only support one result set (using _describe_first_result_set)
            if (!sp.resultSets || !sp.resultSets.length)
                return;

            const classDefinition: ClassDefinition = { name: this.objectNameProvider.getResultSetClassName(sp), accessModifier: 'public', properties: [] };
            sp.resultSets[0].columns.forEach((col) => {
                const propertyName = this.objectNameProvider.getResultSetColumnPropertyName(col);               
                
                const property: PropertyDefinition = { name: propertyName, typeName: col.modelTypeName, accessModifier: 'public' };
                property.isNullable = col.isNullable && SqlToCSharpTypeMapper.canBeNullable(col.modelTypeName);

                classDefinition.properties!.push(property);
            });
            classDefinitions.push(classDefinition);
        });

        return classDefinitions;
    }
}