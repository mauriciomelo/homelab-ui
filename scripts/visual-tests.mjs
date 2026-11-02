import { spawn, execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const image = 'tesselar-visual-browser:1.57.0';
const container = `tesselar-visual-${randomUUID()}`;
const [separator, command, ...args] = process.argv.slice(2);
let child;
let interrupted;
let containerStarted = false;

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    if (interrupted) return reject(new Error(`Interrupted by ${interrupted}`));
    child = spawn(command, args, { stdio: 'inherit', env, detached: true });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      child = undefined;
      if (signal) reject(new Error(`Interrupted by ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interrupted = signal;
    if (child?.pid) process.kill(-child.pid, signal);
  });
}

try {
  if (separator !== '--' || !command) {
    throw new Error('Usage: node scripts/visual-tests.mjs -- <test command>');
  }
  try {
    await exec('docker', ['info', '--format', '{{.ServerVersion}}']);
  } catch {
    throw new Error(
      'Visual tests require Docker. Start Docker Desktop and try again.',
    );
  }
  const { devDependencies } = JSON.parse(
    await readFile(
      new URL('../apps/web/package.json', import.meta.url),
      'utf8',
    ),
  );
  if (devDependencies.playwright !== '1.57.0') {
    throw new Error(
      'Update the visual browser image and server to match the pinned Playwright version.',
    );
  }
  const buildCode = await run('docker', [
    'build',
    '--platform',
    'linux/amd64',
    '--tag',
    image,
    '--file',
    `${root}scripts/visual-browser.Dockerfile`,
    `${root}scripts`,
  ]);
  if (buildCode !== 0)
    throw new Error('Could not build the visual browser image.');

  containerStarted = true;
  await exec('docker', [
    'run',
    '--detach',
    '--rm',
    '--init',
    '--ipc=host',
    '--platform',
    'linux/amd64',
    '--name',
    container,
    '--publish',
    '127.0.0.1::3000',
    image,
  ]);
  const { stdout } = await exec('docker', ['port', container, '3000/tcp']);
  const address = stdout.trim();
  let ready = false;
  for (let attempt = 0; attempt < 60 && !interrupted; attempt++) {
    try {
      const response = await fetch(`http://${address}/`, {
        signal: AbortSignal.timeout(1000),
      });
      ready = response.ok && (await response.text()) === 'Running';
      if (ready) break;
    } catch {
      // The server may still be starting under AMD64 emulation.
    }
    await setTimeout(500);
  }
  if (!ready) {
    const { stdout, stderr } = await exec('docker', ['logs', container]);
    throw new Error(`Visual browser did not become ready.\n${stdout}${stderr}`);
  }
  process.exitCode = await run(command, args, {
    ...process.env,
    PLAYWRIGHT_WS_ENDPOINT: `ws://${address}/`,
    UPDATE_SNAPSHOT: 'none',
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = interrupted === 'SIGINT' ? 130 : interrupted ? 143 : 1;
} finally {
  if (containerStarted) {
    await exec('docker', ['rm', '--force', container]).catch((error) => {
      if (!error.stderr?.includes('No such container')) {
        console.error(
          `Could not remove visual browser container ${container}: ${error.message}`,
        );
        process.exitCode = 1;
      }
    });
  }
}
