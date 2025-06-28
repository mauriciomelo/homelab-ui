import { z } from "zod/v4";

const optionalConfig = z.object({
  PUBLISH_MDNS_SERVICE: z.stringbool().default(true),
});

const clientConfigSchema = z
  .object({
    PROJECT_DIR: z.string().min(1, "PROJECT_DIR must be set"),
    CLUSTER_NAME: z.string().min(1, "CLUSTER_NAME must be set"),
    USER_NAME: z.string().min(1, "USER_NAME must be set"),
    USER_EMAIL: z.email("USER_EMAIL must be a valid email"),
    GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN must be set"),
  })
  .extend(optionalConfig);

export function getAppConfig() {
  return clientConfigSchema.parse(process.env);
}

export function getOptionalConfig() {
  return optionalConfig.parse(process.env);
}
