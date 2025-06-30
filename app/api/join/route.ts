import { spawn } from "child_process";
import { z } from "zod/v4";
import path from "path";

const joinSchema = z.object({
  token: z.string().min(1).max(300),
  serverUrl: z.url().min(1).max(300),
});

export async function POST(req: Request) {
  const body = await req.json();
  const { token, serverUrl } = joinSchema.parse(body);

  // Get the absolute path to join_cluster.sh to avoid privilege escalation issues
  const scriptPath = path.resolve(process.cwd(), "join_cluster.sh");

  const res = new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    // TODO: make sure the token is sanitized to avoid injection attacks
    const cmd = spawn(
      `sudo ${scriptPath} --token=${token} --url=${serverUrl}`,
      {
        shell: false,
      }
    );

    cmd.stdout.on("data", (data) => {
      const log = data.toString();
      console.log(log);
      stdout += log;
    });
    cmd.stderr.on("data", (data) => {
      const log = data.toString();
      console.error(log);
      stderr += log;
    });
    cmd.on("error", (error) => {
      reject(error);
    });
    cmd.on("close", (code) => {
      resolve({
        code,
        stdout,
        stderr,
      });
    });
  });

  return Response.json(await res);
}
