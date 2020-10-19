/*
eslint import/no-dynamic-require: 0
 */
/*
eslint global-require: 0
 */

import program from 'commander';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import crypto from 'crypto';
import inquirer from 'inquirer';

import { configureDevServerCommand } from './command/dev-server';
import { configureServerCommand } from './command/server';
import {
  executeCommand,
  npmInstall,
  writePackageJson,
  requireFromPackage,
  event,
  displayError,
  loadCliManifest,
} from './utils';

const Config = require('./config');
const templates = require('./templates');
const { deploy } = require('./deploy');
const { token, defaultExpiry, collect } = require('./token');

const packageJson = loadCliManifest();

program.name(Object.keys(packageJson.bin)[0])
  .version(packageJson.version);

const logStage = (stage) => {
  console.log(`- ${stage}`);
};

const createApp = async (projectName, options) => {
  const template = options.template || 'express';
  const createAppOptions = { projectName, dbType: options.dbType, template };

  event('Create App', createAppOptions);

  if (await fs.pathExists(projectName)) {
    await displayError(
      `We cannot create a project called ${chalk.green(
        projectName
      )}: directory already exist.\n`,
      createAppOptions
    );
  }
  if (!templates[template]) {
    await displayError(
      `Unknown template ${chalk.red(template)}`,
      createAppOptions
    );
  }
  await fs.ensureDir(projectName);
  process.chdir(projectName);

  logStage('Creating project structure');
  await writePackageJson({
    name: projectName,
    version: '0.0.1',
    private: true,
    scripts: {
      dev: template === 'express' ? 'node index.js' : './node_modules/.bin/cubejs-dev-server'
    }
  });

  logStage('Installing server dependencies');
  await npmInstall(['@cubejs-backend/server']);

  if (!options.dbType) {
    const Drivers = await requireFromPackage('@cubejs-backend/server-core/core/DriverDependencies.js');
    const prompt = await inquirer.prompt([{
      type: 'list',
      name: 'dbType',
      message: 'Select database',
      choices: Object.keys(Drivers)
    }]);

    options.dbType = prompt.dbType;
  }

  logStage('Installing DB driver dependencies');
  const CubejsServer = await requireFromPackage('@cubejs-backend/server');
  let driverDependencies = CubejsServer.driverDependencies(options.dbType);
  if (!driverDependencies) {
    await displayError(`Unsupported db type: ${chalk.green(options.dbType)}`, createAppOptions);
  }
  driverDependencies = Array.isArray(driverDependencies) ? driverDependencies : [driverDependencies];
  if (driverDependencies[0] === '@cubejs-backend/jdbc-driver') {
    driverDependencies.push('node-java-maven');
  }
  await npmInstall(driverDependencies);

  if (driverDependencies[0] === '@cubejs-backend/jdbc-driver') {
    logStage('Installing JDBC dependencies');
    const JDBCDriver = require(path.join(process.cwd(), 'node_modules', '@cubejs-backend', 'jdbc-driver', 'driver', 'JDBCDriver'));
    const dbTypeDescription = JDBCDriver.dbTypeDescription(options.dbType);
    if (!dbTypeDescription) {
      await displayError(`Unsupported db type: ${chalk.green(options.dbType)}`, createAppOptions);
    }

    const newPackageJson = await fs.readJson('package.json');
    if (dbTypeDescription.mavenDependency) {
      newPackageJson.java = {
        dependencies: [dbTypeDescription.mavenDependency]
      };
    }
    newPackageJson.scripts = newPackageJson.scripts || {};
    newPackageJson.scripts.install = './node_modules/.bin/node-java-maven';
    await writePackageJson(newPackageJson);

    await executeCommand('npm', ['install']);
  }

  logStage('Writing files from template');

  const driverClass = await requireFromPackage(driverDependencies[0]);

  const templateConfig = templates[template];
  const env = {
    dbType: options.dbType,
    apiSecret: crypto.randomBytes(64).toString('hex'),
    projectName,
    driverEnvVariables: driverClass.driverEnvVariables && driverClass.driverEnvVariables()
  };
  await Promise.all(Object.keys(templateConfig.files).map(async fileName => {
    await fs.ensureDir(path.dirname(fileName));
    await fs.writeFile(fileName, templateConfig.files[fileName](env));
  }));

  if (templateConfig.dependencies) {
    logStage('Installing template dependencies');
    await npmInstall(templateConfig.dependencies);
  }

  if (templateConfig.devDependencies) {
    logStage('Installing template dev dependencies');
    await npmInstall(templateConfig.devDependencies);
  }

  await event('Create App Success', { projectName, dbType: options.dbType });
  logStage(`${chalk.green(projectName)} app has been created 🎉`);

  console.log();
  console.log('📊 Next step: run dev server');
  console.log();
  console.log(`     $ cd ${projectName}`);
  console.log('     $ npm run dev');
  console.log();
};

const generateSchema = async (options) => {
  const generateSchemaOptions = { tables: options.tables };
  event('Generate Schema', generateSchemaOptions);
  if (!options.tables) {
    await displayError([
      'You must pass table names to generate schema from (-t).',
      '',
      'Example: ',
      ' $ cubejs generate -t orders,customers'
    ], generateSchemaOptions);
  }
  if (!(await fs.pathExists(path.join(process.cwd(), 'node_modules', '@cubejs-backend/server')))) {
    await displayError(
      '@cubejs-backend/server dependency not found. Please run generate command from project directory.',
      generateSchemaOptions
    );
  }

  logStage('Fetching DB schema');
  const CubejsServer = await requireFromPackage('@cubejs-backend/server');
  const driver = await CubejsServer.createDriver();
  await driver.testConnection();
  const dbSchema = await driver.tablesSchema();
  if (driver.release) {
    await driver.release();
  }

  logStage('Generating schema files');
  const ScaffoldingTemplate = await requireFromPackage('@cubejs-backend/schema-compiler/scaffolding/ScaffoldingTemplate');
  const scaffoldingTemplate = new ScaffoldingTemplate(dbSchema, driver);
  const files = scaffoldingTemplate.generateFilesByTableNames(options.tables);
  await Promise.all(files.map(file => fs.writeFile(path.join('schema', file.fileName), file.content)));

  await event('Generate Schema Success', generateSchemaOptions);
  logStage(`Schema for ${options.tables.join(', ')} was successfully generated 🎉`);
};

program
  .usage('<command> [options]')
  .on('--help', () => {
    console.log('');
    console.log('Use cubejs <command> --help for more information about a command.');
    console.log('');
  });

program
  .command('create <name>')
  .option(
    '-d, --db-type <db-type>',
    'Preconfigure for selected database.\n\t\t\t     ' +
    'Options: postgres, mysql, mongobi, athena, redshift, bigquery, mssql, clickhouse, snowflake, presto'
  )
  .option('-t, --template <template>', 'App template. Options: express (default), serverless.')
  .description('Create new Cube.js app')
  .action(
    (projectName, options) => createApp(projectName, options)
      .catch(e => displayError(e.stack || e, { projectName, dbType: options.dbType }))
  )
  .on('--help', () => {
    console.log('');
    console.log('Examples:');
    console.log('');
    console.log('  $ cubejs create hello-world -d postgres');
  });

const list = (val) => val.split(',');

program
  .command('generate')
  .option('-t, --tables <tables>', 'Comma delimited list of tables to generate schema from', list)
  .description('Generate Cube.js schema from DB tables schema')
  .action(
    (options) => generateSchema(options).catch(e => displayError(e.stack || e, { dbType: options.dbType }))
  )
  .on('--help', () => {
    console.log('');
    console.log('Examples:');
    console.log('');
    console.log('  $ cubejs generate -t orders,customers');
  });

program
  .command('token')
  .option('-e, --expiry [expiry]', 'Token expiry. Set to 0 for no expiry', defaultExpiry)
  .option('-s, --secret [secret]', 'Cube.js app secret. Also can be set via environment variable CUBEJS_API_SECRET')
  .option('-p, --payload [values]', 'Payload. Example: -p foo=bar', collect, [])
  .option('-u, --user-context [values]', 'USER_CONTEXT. Example: -u baz=qux', collect, [])
  .description('Create JWT token')
  .action(
    (options) => token(options)
      .catch(e => displayError(e.stack || e))
  )
  .on('--help', () => {
    console.log('');
    console.log('Examples:');
    console.log('');
    console.log('  $ cubejs token -e "1 day" -p foo=bar -p cool=true');
  });

program
  .command('deploy')
  .description('Deploy project to Cube Cloud')
  .action(
    (options) => deploy({ directory: process.cwd(), ...options })
      .catch(e => displayError(e.stack || e))
  )
  .on('--help', () => {
    console.log('');
    console.log('Examples:');
    console.log('');
    console.log('  $ cubejs deploy');
  });

const authenticate = async (currentToken) => {
  const config = new Config();
  await config.addAuthToken(currentToken);
  await event('Cube Cloud CLI Authenticate');
  console.log('Token successfully added!');
};

program
  .command('auth <token>')
  .description('Authenticate access to Cube Cloud')
  .action(
    (currentToken) => authenticate(currentToken)
      .catch(e => displayError(e.stack || e))
  )
  .on('--help', () => {
    console.log('');
    console.log('Examples:');
    console.log('');
    console.log('  $ cubejs auth eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkZXBsb3ltZW50SWQiOiIxIiwidXJsIjoiaHR0cHM6Ly9leGFtcGxlcy5jdWJlY2xvdWQuZGV2IiwiaWF0IjoxNTE2MjM5MDIyfQ.La3MiuqfGigfzADl1wpxZ7jlb6dY60caezgqIOoHt-c');
    console.log('  $ cubejs deploy');
  });

(async () => {
  await configureDevServerCommand(program);
  await configureServerCommand(program);

  if (!process.argv.slice(2).length) {
    program.help();
  }

  program.parse(process.argv);
})();
