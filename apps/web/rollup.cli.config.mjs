import path from 'node:path';
import alias from '@rollup/plugin-alias';
import nodeResolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { builtinModules } from 'node:module';

import packageJson from './package.json' with { type: 'json' };

const projectRoot = path.resolve(import.meta.dirname);

const externalDependencies = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
]);

const external = (id) => {
  if (builtinModules.includes(id) || id.startsWith('node:')) {
    return true;
  }

  return [...externalDependencies].some(
    (dependency) => id === dependency || id.startsWith(`${dependency}/`),
  );
};

const preserveShebang = () => ({
  name: 'preserve-shebang',
  renderChunk(code) {
    return {
      code: `#!/usr/bin/env node\n${code.replace(/^#!.*\n/, '')}`,
      map: null,
    };
  },
});

export default {
  input: './cli/index.ts',
  output: {
    file: './dist-cli/index.mjs',
    format: 'esm',
  },
  external,
  plugins: [
    alias({
      entries: [{ find: '@', replacement: projectRoot }],
    }),
    nodeResolve({
      preferBuiltins: true,
      exportConditions: ['node'],
    }),
    typescript({
      tsconfig: './tsconfig.cli.json',
    }),
    preserveShebang(),
  ],
};
