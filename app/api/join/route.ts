import { exec } from "child_process";
import util from "util";
import { z } from "zod";

const joinSchema = z.object({
  token: z.string().min(1).max(300),
});

export async function POST(req: Request) {
  const body = await req.json();
  const { token } = joinSchema.parse(body);

  const execAsync = util.promisify(exec);

  // TODO: make sure the token is sanitized to avoid injection attacks
  const res = await execAsync(`./join_cluster.sh '${token}'`);

  return Response.json({
    stdout: res.stdout,
    stderr: res.stderr,
  });
}
