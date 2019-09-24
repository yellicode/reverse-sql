# @yellicode/reverse-sql
Reverse engineers an existing SQL-Server database and generates C# entities, CRUD actions and stored procedure calls. This generator is built as an extension to [Yellicode](https://www.yellicode.com/), a cross-platform code generator based on TypeScript and Node.js.

## Features
* Generated code is cross-platform: the code will work in .NET Core as well as .NET Framework projects. The code only depends on a few namespaces, namely `System.Data.SqlClient` (which is part of NET Standard) and, if you need strongly-typed support for table types, `Microsoft.SqlServer.Server`.
* No dependency on any IDE.
* Supports **Stored Procedures**: generates stored procedure calls and entities for corresponding result sets.
* Generates entities for **User-Defined Table Types**: use strongly-typed entities instead of `DataTable`s when stored procedures expect a user-defined table type as parameter.
* Generates basic CRUD operations for **tables**.
* Generates `Select...Where(expression)` methods for basic filtering of table data.
* Customizable: customize which database objects to include, control class- and method names and split your code over multiple files.

## Limitations
* This is not a ORM: it doesn't provide the advanced mapping, querying and caching methods that a ORM provides.
* First result set only: when a stored procedure has more than 1 result set, you will notice that code is only generated for the first one. This is 
actually a limitation in SQL Server because this package uses [sp_describe_first_result_set](https://docs.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-describe-first-result-set-transact-sql) internally. There is no easy, future-proof way to retrieve meta data about more result sets.

## Installation
First, you need to have the Yellicode CLI installed globally. If you haven't yet, run the following command:
```
npm install @yellicode/cli -g
```

Then, in your working directory, make sure that you have a package.json file ([see npm-init](https://docs.npmjs.com/cli/init)) and then run the following:

```
npm install @yellicode/reverse-sql --save-dev
```

## Getting started
This package comes with two sample templates: a [basic template](https://github.com/yellicode/reverse-sql/templates/basic.template.ts) (generates a single C# file, uses all default options) and an [advanced one](https://github.com/yellicode/reverse-sql/templates/advanced.template.ts) (shows how to use most options and splits the output over multiple C# files).

1. Download one of the sample templates to your working directory.
2. In the template, update the `connectionString` variable with the connection string of your own database. 
3. Optionally, update the `outputDirectory`, `namespace` and `dbClassName` variables.
4. Create a new file named `codegenconfig.json` and paste the following contents (assuming you have downloaded the basic template):
```ts
{    
    "templates": [
        {
            "templateFile": "./basic.template.ts",
        }
    ],
    "compileTypeScript": true,
}
```
5. Run `yellicode` or `yellicode --watch` to generate your code.

## <a name="setup-connection"></a> Setting up a database connection
This package depends on the [mssql](https://www.npmjs.com/package/mssql) client for retrieving meta data. The easiest way to make a database connection is 
using a connection string as shown in the sample templates:

``` ts
const pool = new sql.ConnectionPool('Server=myserver,1433;Database=MyDatabase;User Id=MyLogin;Password=mypassword');
```

However, in some scenario's it might be needed to provide a configuration object instead. For example, the client only supports **named database instances** through a config object. 
```ts
const connectionConfig: sql.config = {
    user: 'MyLogin',
    password: 'mypassword',
    server: 'myserver',
    database: 'MyDatabase',
    port: 1433,
    options: {
        instanceName: 'MyInstanceName'
    }
}

const pool = new sql.ConnectionPool(connectionConfig);

```

Refer to the [mssql package documentation](https://github.com/tediousjs/node-mssql#readme) for more information.

## Multiple output files
The generated output can be split over multiple files (i.e. separate files for result set classes, tables and table types). Please check out the [advanced template](https://github.com/yellicode/reverse-sql/templates/advanced.template.ts) for an example.

## Configuration

### Options 
These `ReverseSqlOptions` type holds all reverse-engineering and code generation options. None of the options are required. Usage example:
```ts
const options: ReverseSqlOptions = {
    objectTypes: objectTypes: BuilderObjectTypes.Tables, // generate CRUD methods for tables
    includeSchema: true // include schema in the generated code
};

const pool = new sql.ConnectionPool(connectionString);
const builder = new ReverseDbBuilder(pool, options);

```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| objectTypes | `BuilderObjectTypes` | BuilderObjectTypes.All | Indicates what type of objects to include (refer to the [list of object types](#object-types) below). You can combine this option with any of the 'filter' options.|
| storedProcedureFilter | `(schema: string, name: string) => boolean` | - | A callback function to be run for each stored-procedure. Return true if the stored-procedure must be included.|
| tableFilter | `(schema: string, name: string) => boolean` | - | A callback function to be run for each table. Return true if the table must be included (meaning: CRUD methods will be generated).|
| tableTypeFilter | `(schema: string, name: string) => boolean` | - | A callback function to be run for each user-defined table type. Return true if the user-defined table type must be included.|
| tableInsertMethodFilter | `(schema: string, name: string) => boolean` | - | A callback function to be run for each table that is not omitted by *tableFilter*. Return true to generate a 'Insert' method for the table.|
| tableDeleteMethodFilter | `(schema: string, name: string) => boolean` | - |A callback function to be run for each table that is not omitted by *tableFilter*. Return true to generate a 'Delete' method for the table.|
| tableUpdateMethodFilter | `(schema: string, name: string) => boolean` | - |A callback function to be run for each table that is not omitted by *tableFilter*. Return true to generate a 'Update' method for the table.|
| tableSelectByPrimaryKeyMethodFilter | `(schema: string, name: string) => boolean` | - |A callback function to be run for each table that is not omitted by *tableFilter*. Return true to generate a 'Select' method for the table.|
| tableSelectByExpressionMethodFilter | `(schema: string, name: string) => boolean` | - |A callback function to be run for each table that is not omitted by *tableFilter*. Return true to generate a 'Select...Where' method for the table.|
| objectNameProvider | `ReverseSqlObjectNameProvider` | - | Sets a custom object name provider. |
| includeSchema | `boolean` | `false` |Set to true to include schema names for any database object that is not in the 'dbo' schema.|
| logger | `Logger` | - |Allows you to inject a custom logger.|

### <a name="object-types"></a> Object types
The `objectTypes` option supports the following values:

| Object Type | Description |
| --- | --- |
|`Tables`|Generate CRUD methods and C# entities for tables.|
|`TableTypes`|Generate C# entities for user-defined table types and use these as parameters for generated stored procedure calls. If you exclude table types while you have included stored procedures that expect table-valued parameters as input, the generated parameters will be of type `DataTable`.|
|`StoredProcedures`|Generate stored procedure calls.|
|`All`|Combines all the other options.|

For example, set to `BuilderObjectTypes.Tables` to only reverse engineer tables (or set to `BuilderObjectTypes.All & ~BuilderObjectTypes.Tables` to do the opposite).

## Troubleshooting
* Connection problems: if you encounter a connection error like `ConnectionError: Failed to connect to myserver:1433 - Could not connect (sequence)`, you may need to **enable TCP/IP** on the server: open Sql Server Configuration Manager and expand *SQL Server Network Configuration*. Then select *Protocols for ...* and set *TCP/IP* to `Enabled`. 
* Unable to connect to a **named SQL Server instance**: if you have need to connect to a named SQL server instance, you cannot use a connection string but you should provide a connection configuration object instead. See [setting up a database connection](#setup-connection) for an example.

## Todo
* Add an option to support the new [Microsoft.Data.SqlClient](https://devblogs.microsoft.com/dotnet/introducing-the-new-microsoftdatasqlclient/).
* Support for database Views.
* Transaction support.
* Async support.