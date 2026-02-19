import { Locator, userEvent as vitestUserEvent } from 'vitest/browser';

const speedFactorMap = {
  instant: 0,
  fast: 0.3,
  normal: 1,
  slow: 2,
} as const;

type SetupOptions = {
  speed?: keyof typeof speedFactorMap;
};

const defaultOptions = { speed: 'instant' } satisfies SetupOptions;
/**
 * Custom userEvent with adjustable speed for natural interactions.
 */
export const userEvent = {
  setup(options?: SetupOptions) {
    const { speed } = { ...defaultOptions, ...options };

    const speedFactor = speedFactorMap[speed];
    const user = vitestUserEvent.setup();

    async function fill(element: Locator, value: string) {
      await click(element);
      await user.clear(element);
      for (const char of value) {
        await user.keyboard(char);
        await sleep(20 * speedFactor);
      }
      await sleep(100 * speedFactor);
    }

    async function click(element: Locator) {
      await user.hover(element);
      await sleep(500 * speedFactor);
      await user.click(element);
      await sleep(400 * speedFactor);
    }

    const customFns = {
      fill,
      click,
    };

    return {
      ...user,
      ...(speed === 'instant' ? {} : customFns),
    };
  },
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
