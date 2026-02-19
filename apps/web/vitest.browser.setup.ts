import { afterEach, beforeEach } from 'vitest';
import { hideCursor, showCursor } from './app/(dashboard)/apps/Cursor';

beforeEach(() => showCursor());
afterEach(() => hideCursor());
