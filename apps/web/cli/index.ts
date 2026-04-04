#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as z from 'zod/v4';

import { readAppBundleFromDirectory } from '@/app/api/app-workspaces';
import {
  AppSchema,
  appSchema,
  authClientSchema,
  defaultAppData,
  persistentVolumeClaimSchema,
} from '@/app/api/schemas';

type ValidationOutcome =
  | { ok: true; bundlePath: string }
  | { ok: false; bundlePath: string; errors: string[] };

type NodeError = Error & { code?: string };

const schemaFormats = ['yaml', 'json'] as const;
type SchemaFormat = (typeof schemaFormats)[number];
const schemaFormatSchema = z.enum(schemaFormats);

const isNodeError = (error: unknown): error is NodeError =>
  error instanceof Error && 'code' in error;

const formatIssuePath = (pathParts: PropertyKey[]): string => {
  if (pathParts.length === 0) {
    return 'root';
  }

  return pathParts
    .map((part, index) => {
      if (typeof part === 'number') {
        return `[${part}]`;
      }

      if (typeof part === 'symbol') {
        const symbolText = part.description ?? part.toString();
        return index === 0 ? symbolText : `.${symbolText}`;
      }

      if (index === 0) {
        return part;
      }

      return `.${part}`;
    })
    .join('');
};

const resolveAppBundlePath = (appPath: string): string => {
  const resolvedPath = path.resolve(appPath);
  return resolvedPath.endsWith('.yaml') || resolvedPath.endsWith('.yml')
    ? path.dirname(resolvedPath)
    : resolvedPath;
};

const resolveAppFilePath = (appPath: string): string => {
  const resolvedPath = path.resolve(appPath);
  return resolvedPath.endsWith('.yaml') || resolvedPath.endsWith('.yml')
    ? resolvedPath
    : path.join(resolvedPath, 'app.yaml');
};

const ensureDirectory = async (filePath: string) => {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
};

const fileExists = async (filePath: string) => {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
};

const validateAppBundle = async (
  appPath: string,
): Promise<ValidationOutcome> => {
  const bundlePath = resolveAppBundlePath(appPath);

  try {
    await readAppBundleFromDirectory(bundlePath);
    return { ok: true, bundlePath };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        bundlePath,
        errors: error.issues.map((issue) => {
          const issuePath = formatIssuePath(issue.path);
          return `${issuePath}: ${issue.message}`;
        }),
      };
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, bundlePath, errors: [message] };
  }
};

const appResourceSchemas = {
  App: appSchema,
  AuthClient: authClientSchema,
  PersistentVolumeClaim: persistentVolumeClaimSchema,
} as const;

const formatAppSchema = (format: SchemaFormat) => {
  const jsonSchema = Object.fromEntries(
    Object.entries(appResourceSchemas).map(([name, schema]) => [
      name,
      z.toJSONSchema(schema, { io: 'input' }),
    ]),
  );

  if (format === 'json') {
    return JSON.stringify(jsonSchema, null, 2);
  }

  return YAML.stringify(jsonSchema);
};

const run = async () => {
  await yargs(hideBin(process.argv))
    .scriptName('tess')
    .usage('$0 <command> [options]')
    .command(
      'app <command>',
      'Manage app configuration files',
      (appYargs) =>
        appYargs
          .command(
            'validate <appPath>',
            'Validate an app bundle directory against the bundle schema',
            {
              appPath: {
                type: 'string',
                demandOption: true,
                describe:
                  'Path to an app directory or bundle file like app.yaml',
              },
            },
            async (argv) => {
              const outcome = await validateAppBundle(argv.appPath);

              if (!outcome.ok) {
                process.stderr.write(
                  `Invalid app bundle: ${outcome.bundlePath}\n`,
                );
                outcome.errors.forEach((error) => {
                  process.stderr.write(`- ${error}\n`);
                });
                process.exitCode = 1;
                return;
              }

              process.stdout.write(`Valid app bundle: ${outcome.bundlePath}\n`);
            },
          )
          .command(
            'init <name> [targetPath]',
            'Create a starter app.yaml with default values',
            {
              name: {
                type: 'string',
                demandOption: true,
                describe: 'App name to set in the config',
              },
              targetPath: {
                type: 'string',
                default: '.',
                describe:
                  'Directory to create app.yaml in, or a path to a yaml file',
              },
            },
            async (argv) => {
              const filePath = resolveAppFilePath(argv.targetPath);

              if (await fileExists(filePath)) {
                process.stderr.write(
                  `Refusing to overwrite existing file: ${filePath}\n`,
                );
                process.exitCode = 1;
                return;
              }

              const appData = createDefaultAppData(argv.name);

              await ensureDirectory(filePath);
              await fs.writeFile(filePath, YAML.stringify(appData), 'utf8');

              process.stdout.write(`Created ${filePath}\n`);
            },
          )
          .command(
            'schema',
            'Print schemas for app bundle resources',
            {
              format: {
                type: 'string',
                choices: schemaFormats,
                default: 'yaml',
                describe: 'Output format for the schema',
              },
            },
            async (argv) => {
              const format = schemaFormatSchema
                .catch('yaml')
                .parse(argv.format);
              const output = formatAppSchema(format);
              process.stdout.write(`${output}\n`);
            },
          )
          .demandCommand(1, 'Provide an app command to run')
          .strict(),
      () => {},
    )
    .recommendCommands()
    .demandCommand(1, 'Provide a command to run')
    .strict()
    .help()
    .alias('help', 'h')
    .version('0.0.0')
    .alias('version', 'v')
    .parse();
};

void run().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

const createDefaultAppData = (name: string): AppSchema => ({
  ...defaultAppData,
  metadata: {
    ...defaultAppData.metadata,
    name,
  },
});
