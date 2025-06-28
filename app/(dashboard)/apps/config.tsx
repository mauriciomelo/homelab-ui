import { z } from "zod/v4";

const configSchema = z.object({
  PROJECT_DIR: z.string().min(1, "PROJECT_DIR must be set"),
  CLUSTER_NAME: z.string().min(1, "CLUSTER_NAME must be set"),
  USER_NAME: z.string().min(1, "USER_NAME must be set"),
  USER_EMAIL: z.string().email("USER_EMAIL must be a valid email"),
  GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN must be set"),
  SKIP_MDNS: z.stringbool().default(false),
});

export function getAppConfig() {
  return configSchema.parse(process.env);
}
