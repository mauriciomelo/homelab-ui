import { spawn } from 'child_process';

export function reset() {
  const res = new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const cmd = spawn('sudo', ['/usr/local/bin/k3s-agent-uninstall.sh'], {
      shell: false,
    });

    cmd.stdout.on('data', (data) => {
      const log = data.toString();
      console.log(log);
      stdout += log;
    });
    cmd.stderr.on('data', (data) => {
      const log = data.toString();
      console.error(log);
      stderr += log;
    });
    cmd.on('error', (error) => {
      reject(error);
    });
    cmd.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr,
      });
    });
  });
  return res;
}

export async function POST() {
  return Response.json(await reset());
}
