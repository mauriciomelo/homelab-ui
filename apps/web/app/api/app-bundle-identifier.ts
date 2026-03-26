import z from 'zod/v4';

export const appBundleIdentifierSchema = z
  .object({
    appName: z.string().min(1).optional(),
    draftId: z.string().min(1).optional(),
  })
  .superRefine((input, ctx) => {
    const targetCount =
      Number(input.appName !== undefined) + Number(input.draftId !== undefined);

    if (targetCount !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide exactly one of appName or draftId',
        path: ['appName'],
      });
    }
  });

export type AppBundleIdentifier =
  | {
      draftId: string;
      appName?: undefined;
    }
  | {
      appName: string;
      draftId?: undefined;
    };

export function parseAppBundleIdentifier(input: unknown): AppBundleIdentifier {
  const parsedInput = appBundleIdentifierSchema.parse(input);

  if (parsedInput.draftId !== undefined) {
    return { draftId: parsedInput.draftId };
  }

  if (parsedInput.appName === undefined) {
    throw new Error('Provide exactly one of appName or draftId');
  }

  return { appName: parsedInput.appName };
}

export function getAppBundleIdentifier(input: {
  appName?: string | null;
  draftId?: string | null;
}): AppBundleIdentifier | null {
  const normalizedInput = {
    appName: input.appName ?? undefined,
    draftId: input.draftId ?? undefined,
  };

  if (!normalizedInput.appName && !normalizedInput.draftId) {
    return null;
  }

  return parseAppBundleIdentifier(normalizedInput);
}

export function isDraftAppBundleIdentifier(
  identifier: AppBundleIdentifier,
): identifier is { draftId: string; appName?: undefined } {
  return identifier.draftId !== undefined;
}
