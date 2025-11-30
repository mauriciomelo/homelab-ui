import { z } from 'zod/v4';

const optionalConfig = z.object({
  PUBLISH_MDNS_SERVICE: z.stringbool().default(true),
  PORT: z.coerce.number().default(3000),
  ZITADEL_URL: z.url().optional(),
});

const clientConfigSchema = z.object({
  ...optionalConfig.shape,
  PROJECT_DIR: z.string().min(1, 'PROJECT_DIR must be set'),
  CLUSTER_NAME: z.string().min(1, 'CLUSTER_NAME must be set'),
  USER_NAME: z.string().min(1, 'USER_NAME must be set'),
  USER_EMAIL: z.email('USER_EMAIL must be a valid email'),
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN must be set'),
});

export function getAppConfig() {
  return clientConfigSchema.parse(getEnvironmentVariables());
}

export function getOptionalConfig() {
  return optionalConfig.parse(getEnvironmentVariables());
}

function getEnvironmentVariables() {
  return {
    ...getTestDefaults(),
    ...process.env,
  };
}

function getTestDefaults() {
  if (process.env.NODE_ENV !== 'test') {
    return {};
  }

  return {
    ZITADEL_URL: 'https://example.homelab.local',
  };
}
