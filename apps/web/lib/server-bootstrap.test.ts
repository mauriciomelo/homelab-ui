import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  registerAppController,
  stopAppController,
  registerAuthClientController,
  stopAuthClientController,
} = vi.hoisted(() => ({
  registerAppController: vi.fn<() => Promise<void>>(),
  stopAppController: vi.fn<() => void>(),
  registerAuthClientController: vi.fn<() => Promise<void>>(),
  stopAuthClientController: vi.fn<() => void>(),
}));
vi.mock('@/app/api/app-controller', () => ({
  registerAppController,
  stopAppController,
}));
vi.mock('@/app/api/auth-controller', () => ({
  registerAuthClientController,
  stopAuthClientController,
}));
vi.mock('@/mdns', () => ({ publishService: vi.fn() }));
vi.mock('@/app/(dashboard)/apps/config', () => ({
  getOptionalConfig: () => ({ PUBLISH_MDNS_SERVICE: false }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  registerAppController.mockResolvedValue();
  registerAuthClientController.mockResolvedValue();
});

async function loadServer() {
  const bootstrap = await import('./server-bootstrap');
  const { GET: live } = await import('../routes/health/live');
  const { GET: ready } = await import('../routes/health/ready');
  return { ...bootstrap, live, ready };
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('server health', () => {
  it('responds to liveness before controller startup without starting controllers', async () => {
    const { live, ready } = await loadServer();
    const response = live();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(ready().status).toBe(503);
    expect(registerAppController).not.toHaveBeenCalled();
    expect(registerAuthClientController).not.toHaveBeenCalled();
  });

  it('becomes ready only after both controller registrations finish', async () => {
    const apps = deferred();
    const auth = deferred();
    registerAppController.mockReturnValue(apps.promise);
    registerAuthClientController.mockReturnValue(auth.promise);
    const { ensureServerBootstrap, ready } = await loadServer();
    const startup = ensureServerBootstrap();
    expect(ready().status).toBe(503);
    apps.resolve();
    await vi.waitFor(() =>
      expect(registerAuthClientController).toHaveBeenCalledOnce(),
    );
    const pending = ready();
    expect(pending.status).toBe(503);
    expect(await pending.json()).toEqual({ ready: false });
    auth.resolve();
    await startup;
    const response = ready();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ready: true });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('shares startup across concurrent calls and does not register controllers twice', async () => {
    const apps = deferred();
    registerAppController.mockReturnValue(apps.promise);
    const { ensureServerBootstrap, ready } = await loadServer();
    const first = ensureServerBootstrap();
    const second = ensureServerBootstrap();
    expect(registerAppController).toHaveBeenCalledOnce();
    expect(ready().status).toBe(503);
    apps.resolve();
    await Promise.all([first, second]);
    await ensureServerBootstrap();
    expect(registerAppController).toHaveBeenCalledOnce();
    expect(registerAuthClientController).toHaveBeenCalledOnce();
    expect(ready().status).toBe(200);
  });

  it('keeps readiness false and propagates controller startup failures', async () => {
    registerAuthClientController.mockRejectedValue(
      new Error('Registration failed'),
    );
    const { ensureServerBootstrap, live, ready } = await loadServer();
    await expect(ensureServerBootstrap()).rejects.toThrow(
      'Registration failed',
    );
    expect(ready().status).toBe(503);
    expect(live().status).toBe(200);
    await expect(ensureServerBootstrap()).rejects.toThrow(
      'Registration failed',
    );
    expect(registerAppController).toHaveBeenCalledOnce();
    expect(registerAuthClientController).toHaveBeenCalledOnce();
  });

  it('stops controller watches cleanly on shutdown', async () => {
    const { ensureServerBootstrap, shutdownServer, ready } = await loadServer();
    await ensureServerBootstrap();
    expect(ready().status).toBe(200);

    shutdownServer();

    expect(ready().status).toBe(503);
    expect(stopAppController).toHaveBeenCalledOnce();
    expect(stopAuthClientController).toHaveBeenCalledOnce();
  });
});
