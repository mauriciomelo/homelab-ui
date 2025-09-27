import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './test-utils/mocks/node';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
