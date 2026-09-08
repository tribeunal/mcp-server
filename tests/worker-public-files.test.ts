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
