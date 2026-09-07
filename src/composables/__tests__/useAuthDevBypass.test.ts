import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The bypass signs in with a real password grant. initAuth used to fire it and
// return at once, relying on the SIGNED_IN event to fill in user/session
// later - but EditorView awaits initAuth and then loads its route, and a route
// that mounts with `user` still null loads nothing. So initAuth has to settle
// only once the sign-in has.

const getSession = vi.fn();
const signInWithPassword = vi.fn();
const onAuthStateChange = vi.fn();

vi.mock('@/composables/useSupabase', () => ({
  supabase: { auth: { getSession, signInWithPassword, onAuthStateChange } },
}));
vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({ error: vi.fn() }),
}));

const SESSION = {
  access_token: 't',
  user: { id: 'u-dev', email: 'dev@example.test' },
};

/** Lets a test decide when the sign-in settles. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

// The composable keeps module-level state (user, session, a once-only sign-in
// flag), so every test gets a fresh copy.
const load = async () => (await import('@/composables/useAuth')).useAuth();

beforeEach(() => {
  vi.resetModules();
  getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  signInWithPassword.mockReset();
  onAuthStateChange.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubEnv('VITE_DEV_AUTH_BYPASS', 'true');
  vi.stubEnv('VITE_DEV_AUTH_EMAIL', 'dev@example.test');
  vi.stubEnv('VITE_DEV_AUTH_PASSWORD', 'pw');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('initAuth with the dev auth bypass', () => {
  it('does not settle until the bypass sign-in has, and applies its session', async () => {
    const signIn = deferred<{ data: { session: typeof SESSION }; error: null }>();
    signInWithPassword.mockReturnValue(signIn.promise);
    const auth = await load();

    let settled = false;
    const pending = auth.initAuth().then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(auth.user.value).toBeNull();

    signIn.resolve({ data: { session: SESSION }, error: null });
    await pending;

    expect(auth.user.value?.id).toBe('u-dev');
    expect(auth.session.value?.access_token).toBe('t');
    expect(auth.isLoading.value).toBe(false);
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'dev@example.test', password: 'pw' });
  });

  // App.vue and EditorView both call initAuth on mount. The second caller must
  // wait for the sign-in the first one started, not skip past it signed out.
  it('makes every concurrent caller wait for the one sign-in', async () => {
    const signIn = deferred<{ data: { session: typeof SESSION }; error: null }>();
    signInWithPassword.mockReturnValue(signIn.promise);
    const auth = await load();

    let firstSettled = false;
    let secondSettled = false;
    const first = auth.initAuth().then(() => { firstSettled = true; });
    const second = auth.initAuth().then(() => { secondSettled = true; });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(firstSettled).toBe(false);
    expect(secondSettled).toBe(false);

    signIn.resolve({ data: { session: SESSION }, error: null });
    await Promise.all([first, second]);

    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    expect(auth.user.value?.id).toBe('u-dev');
  });

  it('leaves an existing session alone', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    const auth = await load();

    await auth.initAuth();

    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(auth.user.value?.id).toBe('u-dev');
  });

  it('settles signed out when the sign-in fails, without throwing', async () => {
    signInWithPassword.mockResolvedValue({ data: { session: null }, error: { message: 'nope' } });
    const auth = await load();

    await auth.initAuth();

    expect(auth.user.value).toBeNull();
    expect(auth.isLoading.value).toBe(false);
  });

  it('does nothing when the flag is off', async () => {
    vi.stubEnv('VITE_DEV_AUTH_BYPASS', 'false');
    const auth = await load();

    await auth.initAuth();

    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(auth.user.value).toBeNull();
  });
});
