import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

// The root package is `"type": "module"` but `worker/package.json` declares no
// type, so tsx loads `worker/src` as CommonJS and a NAMED import throws
// "does not provide an export named". Default-import the module object and
// destructure it.
import mod from '../worker/src/public-files.ts';
const { PublicFiles, LLMS_TXT, RAW_SKILL_URL } = mod as any;
import handlerMod from '../worker/src/auth0-handler.ts';
const { Auth0Handler } = handlerMod as any;

const REPO = join(import.meta.dirname, '..');

/**
 * The Worker never bundles or copies SKILL.md. It proxies GitHub, because the
 * canonical bytes are the ones on `main` and a second copy is a second thing to
 * drift. These tests pin the two rules that make that safe: response headers
 * are built from scratch (GitHub's `text/plain` and `max-age=300` must not leak
 * through), and a failed upstream is never cached.
 */

/** Stand in for GitHub, restoring the real fetch even when an assertion throws. */
async function withFetch(stub: typeof globalThis.fetch, body: () => Promise<void>): Promise<void> {
  const real = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    await body();
  } finally {
    globalThis.fetch = real;
  }
}

/** Records the init the route hands to fetch, so the cache rules can be asserted. */
function recordingFetch(response: () => Response): { calls: any[]; stub: typeof globalThis.fetch } {
  const calls: any[] = [];
  const stub = (async (url: any, init: any) => {
    calls.push({ url, init });
    return response();
  }) as unknown as typeof globalThis.fetch;
  return { calls, stub };
}

test('GET /skill.md proxies the raw file under our own headers', async () => {
  const upstream = '---\nname: tribeunal\n---\n\n# Tribeunal\n';
  await withFetch(
    async () => new Response(upstream, {
      status: 200,
      // Exactly what raw.githubusercontent.com answers today.
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'max-age=300' },
    }),
    async () => {
      const res = await PublicFiles.request('/skill.md');
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'text/markdown; charset=utf-8');
      assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
      assert.equal(await res.text(), upstream, 'the body must be byte-identical to the origin');
    },
  );
});

test('GET /skill.md answers 502 and refuses to cache when the origin 404s', async () => {
  await withFetch(
    async () => new Response('404: Not Found', { status: 404 }),
    async () => {
      const res = await PublicFiles.request('/skill.md');
      assert.equal(res.status, 502);
      assert.match(res.headers.get('content-type') ?? '', /^text\/plain/);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.match(
        await res.text(),
        /raw\.githubusercontent\.com\/tribeunal\/mcp-server\/main\/SKILL\.md/,
        'a 502 body must name the origin so the reader can fetch it directly',
      );
    },
  );
});

test('GET /skill.md tells Cloudflare to cache success and never cache failure', async () => {
  // The 502's own `no-store` is a different rule from this one, and asserting
  // only that leaves the cache directives untested — a typo in the `cf` key
  // would still compile and every other test would still pass.
  const { calls, stub } = recordingFetch(() => new Response('ok', { status: 200 }));
  await withFetch(stub, async () => {
    await PublicFiles.request('/skill.md');
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, RAW_SKILL_URL);
  const cf = calls[0].init?.cf;
  assert.ok(cf, 'the request must carry cf options');
  assert.equal(cf.cacheEverything, true, '.md is not cached by default');
  assert.equal(cf.cacheTtlByStatus['200-299'], 3600);
  for (const [range, ttl] of Object.entries(cf.cacheTtlByStatus)) {
    if (range === '200-299') continue;
    assert.ok((ttl as number) < 0, `${range} must be negative (do not cache), got ${ttl}`);
  }
  // Every failing status must be covered by some negative range.
  const covered = Object.keys(cf.cacheTtlByStatus).filter((r) => r !== '200-299');
  assert.ok(
    covered.some((r) => r.startsWith('4')) && covered.some((r) => r.endsWith('599')),
    `4xx and 5xx must both be un-cached, got ${covered.join(', ')}`,
  );
});

test('GET /skill.md answers 502 when the origin fetch throws', async () => {
  await withFetch(
    async () => { throw new Error('connection reset'); },
    async () => {
      const res = await PublicFiles.request('/skill.md');
      assert.equal(res.status, 502);
      assert.equal(res.headers.get('cache-control'), 'no-store');
    },
  );
});

test('GET /llms.txt serves the constant, which equals the committed llms.txt', async () => {
  const res = await PublicFiles.request('/llms.txt');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(await res.text(), LLMS_TXT);
  // A proxy would 502 before the branch is merged, so this one file is a
  // constant — and this assertion is what stops it drifting from the real one.
  assert.equal(
    LLMS_TXT,
    readFileSync(join(REPO, 'llms.txt'), 'utf8'),
    'worker/src/public-files.ts LLMS_TXT is stale — copy llms.txt into it',
  );
});

test('the origin constant points at the canonical raw URL', () => {
  assert.equal(RAW_SKILL_URL, 'https://raw.githubusercontent.com/tribeunal/mcp-server/main/SKILL.md');
});

/**
 * The mount is two lines in auth0-handler.ts, and two lines are exactly where a
 * routing mistake hides. Driving PublicFiles directly cannot see it: these two
 * assertions are the ones that fail if `app.route('/', PublicFiles)` is dropped,
 * or if mounting at '/' ever shadows the OAuth routes it sits beside.
 */
test('the public files are reachable through Auth0Handler, which still owns /authorize', async () => {
  await withFetch(
    async () => new Response('# Tribeunal\n', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }),
    async () => {
      const skill = await Auth0Handler.request('/skill.md');
      assert.equal(skill.status, 200, '/skill.md must resolve through the mounted handler');
      assert.equal(skill.headers.get('content-type'), 'text/markdown; charset=utf-8');

      const llms = await Auth0Handler.request('/llms.txt');
      assert.equal(llms.status, 200);
    },
  );

  // /authorize is Hono's, not ours. Without real Workers bindings it cannot
  // complete, and Hono turns that into a 500 — which is fine. What must never
  // happen is a 404: that would mean the mount had swallowed the route. The
  // error handler is stubbed so a torn-down /authorize does not print a stack
  // into an otherwise clean test run.
  const quiet = Auth0Handler.onError?.bind(Auth0Handler);
  Auth0Handler.onError(() => new Response('stubbed', { status: 500 }));
  try {
    const authorize = await Auth0Handler.request('/authorize');
    assert.notEqual(authorize.status, 404, 'mounting at / must not shadow /authorize');
    const callback = await Auth0Handler.request('/callback');
    assert.notEqual(callback.status, 404, 'mounting at / must not shadow /callback');
  } finally {
    if (quiet) Auth0Handler.onError(() => new Response('error', { status: 500 }));
  }
});
