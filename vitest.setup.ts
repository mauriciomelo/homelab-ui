import { beforeAll, afterEach, afterAll } from 'vitest';

// Only load Node MSW for Node tests
if (typeof window === 'undefined') {
  const { server } = require('./test-utils/mocks/node');

  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}
