/*******************************************************************************************/
/* Basic template showing the use of @yellicode/reverse-sql.
/* 
/* Reverse engineers an existing SQL-Server database and generates C# entities, CRUD actions 
/* and stored procedure calls.
/*
/*                      https://github.com/yellicode/reverse-sql
/*
/*******************************************************************************************/

import * as sql from 'mssql';
import * as path from 'path';

import { Generator } from '@yellicode/templating';
import { ReverseDbBuilder, ReverseSqlOptions, DataAccessWriter, SqlServerDatabase } from '@yellicode/reverse-sql'
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
 * Reverse engineering and code generation options. See https://github.com/yellicode/reverse-sql or check out the 
 * advanced template for examples.
 */
const options: ReverseSqlOptions = {
    // using all the defaults
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
 * Builds the model and then generates all data access code in a single file.
 */
Generator
    .buildModel<SqlServerDatabase>(buildDbModel)
    .then((db: SqlServerDatabase) => {        
        const dataAccessFileName = path.join(outputDirectory, `${dbClassName}.cs`);
        Generator.generate({ outputFile: dataAccessFileName }, (output) => {
            const csharpWriter = new CSharpWriter(output);
            const dataAccessWriter = new DataAccessWriter(csharpWriter, namespace, options);
            dataAccessWriter.writeAll(db, dbClassName);
        });

    }).catch(e => {        
        console.log(`An error has occured: ${e}`);
    });