import { beforeAll, describe, test } from 'vitest';
import { appSchema, authClientSchema, persistentVolumeClaimSchema } from './';
import * as z from 'zod/v4';
import * as fs from 'node:fs/promises';
import path from 'node:path';

const schemaDir = path.join(__dirname, '__generated__');

const appResources = [authClientSchema, persistentVolumeClaimSchema].map(
  (schema) => ({ schema, fileName: `${schema.shape.kind.value}.schema.json` }),
);

const app = {
  schema: appSchema,
  fileName: 'App.schema.json',
};

const allSchemas = [...appResources, app];

describe('schemas', () => {
  beforeAll(async () => {
    await removeAllSchemaFiles();
  });

  allSchemas.forEach(({ schema, fileName }) => {
    test(`generates schema: ${fileName}`, async () => {
      const jsonSchema = z.toJSONSchema(schema, { io: 'input' });

      await fs.writeFile(
        path.join(schemaDir, fileName),
        JSON.stringify(jsonSchema, null, 2),
      );
    });
  });
});

async function removeAllSchemaFiles() {
  for (const file of await fs.readdir(schemaDir)) {
    await fs.unlink(path.join(schemaDir, file));
  }
}
