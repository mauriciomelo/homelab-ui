import { z } from 'zod/v4';

const optionalConfig = z.object({
  PUBLISH_MDNS_SERVICE: z.stringbool().default(true),
  PORT: z.coerce.number().default(3000),
  ZITADEL_URL: z.url().optional(),
});

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
