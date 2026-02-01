#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import type { ArgumentsCamelCase } from 'yargs';
import { AppSchema, appSchema, defaultAppData } from '@/app/api/schemas';

type ValidationOutcome =
  | { ok: true; filePath: string }
  | { ok: false; filePath: string; errors: string[] };

type NodeError = Error & { code?: string };

const isValidationFailure = (
  outcome: ValidationOutcome,
): outcome is { ok: false; filePath: string; errors: string[] } =>
  outcome.ok === false;

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

const validateAppFile = async (appPath: string): Promise<ValidationOutcome> => {
  const filePath = resolveAppFilePath(appPath);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const documents = YAML.parseAllDocuments(content);
    const parseErrors = documents.flatMap((document) => document.errors);

    if (parseErrors.length > 0) {
      const errors = parseErrors.map((error) => error.message);
      return { ok: false, filePath, errors };
    }

    const parsed = YAML.parse(content);
    const result = appSchema.safeParse(parsed);

    if (result.success) {
      return { ok: true, filePath };
    }

    const errors = result.error.issues.map((issue) => {
      const issuePath = formatIssuePath(issue.path);
      return `${issuePath}: ${issue.message}`;
    });

    return { ok: false, filePath, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, filePath, errors: [message] };
  }
};

const run = async () => {
  yargs(hideBin(process.argv))
    .scriptName('tess')
    .usage('$0 <command> [options]')
    .command(
      'app <command>',
      'Manage app configuration files',
      (appYargs) =>
        appYargs
          .command(
            'validate <appPath>',
            'Validate an app.yaml against the app schema',
            {
              appPath: {
                type: 'string',
                demandOption: true,
                describe: 'Path to an app directory or app.yaml file',
              },
            },
            async (argv) => {
              const outcome = await validateAppFile(argv.appPath);

              if (isValidationFailure(outcome)) {
                process.stderr.write(
                  `Invalid app config: ${outcome.filePath}\n`,
                );
                outcome.errors.forEach((error) => {
                  process.stderr.write(`- ${error}\n`);
                });
                process.exitCode = 1;
                return;
              }

              process.stdout.write(`Valid app config: ${outcome.filePath}\n`);
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

run().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

const createDefaultAppData = (name: string): AppSchema => ({
  ...defaultAppData,
  name,
});
