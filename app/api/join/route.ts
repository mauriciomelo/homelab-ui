import { exec } from "child_process";
import util from "util";
import { z } from "zod/v4";
import path from "path";

const joinSchema = z.object({
  token: z.string().min(1).max(300),
  serverUrl: z.url().min(1).max(300),
});

export async function POST(req: Request) {
  const body = await req.json();
  const { token, serverUrl } = joinSchema.parse(body);

  const execAsync = util.promisify(exec);

  // Get the absolute path to join_cluster.sh to avoid privilege escalation issues
  const scriptPath = path.resolve(process.cwd(), "join_cluster.sh");

  const command = `K3S_URL=${serverUrl} K3S_TOKEN=${token} ${scriptPath}`;
  // TODO: make sure the token is sanitized to avoid injection attacks
  const res = await execAsync(command);

  return Response.json({
    stdout: res.stdout,
    stderr: res.stderr,
  });
}
