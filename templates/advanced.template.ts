/*******************************************************************************************/
/* Advanced template showing the use of @yellicode/reverse-sql.
/* 
/* Reverse engineers an existing SQL-Server database and generates C# entities, CRUD actions 
/* and stored procedure calls.
/*
/*                      https://github.com/yellicode/reverse-sql
/* 
/* This advanced template shows how to use various configuration options, as well as how 
/* to split the generated code over multiple files.
/*
/*******************************************************************************************/

import * as sql from 'mssql';
import * as path from 'path';

import { Generator } from '@yellicode/templating';
import { ReverseDbBuilder, ReverseSqlOptions, DataAccessWriter, SqlServerDatabase, DefaultReverseSqlObjectNameProvider, SqlStoredProcedure, BuilderObjectTypes } from '@yellicode/reverse-sql'
import { CSharpWriter } from '@yellicode/csharp';

/**
 * The connection string to your database. Do not forget to turn on TCP/IP in the SQL Server Network Configuration -> Protocols for ...
 * Also, make sure that the user has sufficient permissions.
 */
const connectionString = `Server=myserver,1433;Database=MyDatabase;User Id=MyUserId;Password=mypassword`;

/**
 * The directory where the code should be generated. The path must be relative to this template's directory.
 */
const outputDirectory = './output'; 

/**
 * The namepace in which all data access code must be generated.
 */
const namespace = 'MyProject.Data';

/**
 * The name of the generated database class (the main class that contains all data-access methods).
 */
const dbClassName = 'MyDatabase';

/**
 * Example: only include stored procedure with the following names. Uncomment ReverseSqlOptions.storedProcedureFilter below to use this whitelist.
 */
const storedProcWhiteList = [
    'SomeStoredProcedure',
    'AnotherStoredProcedure'
];

/**
 * A custom object name provider. Shows how to override the method names generated 
 * for stored procedure calls. Uncomment ReverseSqlOptions.objectNameProvider below to use it.
 */
class CustomObjectNameProvider extends DefaultReverseSqlObjectNameProvider {    
    constructor(includeSchema: boolean) {
        super(includeSchema);        
    }
    
    /**
     * Prefixes each stored procedure call with 'SP_'.
     */
    public /* override */ getStoredProcedureMethodName(sp: SqlStoredProcedure): string {        
        const name = super.getStoredProcedureMethodName(sp);
        return `SP_${name}`;
    }
}

/**
 * Reverse engineering and code generation options.
 */
const options: ReverseSqlOptions = {
    // includeSchema: true, // include schema in the generated code (the default is false)
    // objectNameProvider: new CustomObjectNameProvider(true), // use our own object name provider
    // objectTypes: BuilderObjectTypes.All, // include all objects (default)
    // storedProcedureFilter: (schema, name) => { return storedProcWhiteList.indexOf(name) >= 0 }, // using our whitelist above
    // tableTypeFilter: (schema, name) => {return true;}, // include all table types (default)
    // tableFilter: (schema, name) => {return true;}, // include all tables (default)   
    // tableInsertMethodFilter: (schema, name) => {return true;}, // generate inserts for all tables (default)   
    // tableDeleteMethodFilter: (schema, name) => {return true;}, // generate deletes for all tables (default)   
    // tableUpdateMethodFilter: (schema, name) => {return true;}, // generate updates for all tables (default)   
    // tableSelectByPrimaryKeyMethodFilter: (schema, name) => {return true;}, // generate selects for all tables (default)   
    // tableSelectByExpressionMethodFilter: (schema, name) => {return true;}, // generate selects for all tables (default)   
};

/**
 * Reverse engineers the target database into an in-memory model, which we will use below.
 */
const buildDbModel = (): Promise<SqlServerDatabase> => {
    const pool = new sql.ConnectionPool(connectionString);
    const builder = new ReverseDbBuilder(pool, options);
    console.log('Building model...');

    return builder
        .build()
        .then((db: SqlServerDatabase)=> {
            console.log('Building database model completed.');
            return db;
        });
}

/**
 * Builds the model and then generates data access code in multiple files.
 */
Generator
    .buildModel<SqlServerDatabase>(buildDbModel)
    .then((db: SqlServerDatabase) => {        
         // Stored procedure result sets
         Generator.generate({ outputFile: path.join(outputDirectory, 'ResultSets.cs') }, (output) => {
            const csharpWriter = new CSharpWriter(output);
            const dataAccessWriter = new DataAccessWriter(csharpWriter, namespace, options);
            dataAccessWriter.writeStoredProcResultSetClasses(db, true);
        });

        // Tables
        Generator.generate({ outputFile: path.join(outputDirectory, 'Tables.cs') }, (output) => {
            const csharpWriter = new CSharpWriter(output);
            const dataAccessWriter = new DataAccessWriter(csharpWriter, namespace, options);
            dataAccessWriter.writeTableClasses(db, true);
        });

        // Table types
        Generator.generate({ outputFile: path.join(outputDirectory, 'TableTypes.cs') }, (output) => {
            const csharpWriter = new CSharpWriter(output);
            const dataAccessWriter = new DataAccessWriter(csharpWriter, namespace, options);
            dataAccessWriter.writeTableTypeClasses(db, true);
        });

        // Database class
        const dbClassFileName = path.join(outputDirectory, `${dbClassName}.cs`);        
        Generator.generate({ outputFile: dbClassFileName }, (output) => {
            const csharpWriter = new CSharpWriter(output);
            const dataAccessWriter = new DataAccessWriter(csharpWriter, namespace, options);
            dataAccessWriter.writeDatabaseClass(db, dbClassName, true);
        });


    }).catch(e => {        
        console.log(`An error has occured: ${e}`);
    });