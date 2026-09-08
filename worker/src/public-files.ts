import { Hono } from 'hono';

/**
 * Public files served from the MCP host.
 *
 * `skill.md` is PROXIED, never bundled. The canonical bytes are the repo-root
 * SKILL.md on GitHub `main`; a copy compiled into the Worker would be a second
 * source of truth and would drift the moment the skill is edited. GitHub
 * answers `text/plain` with `max-age=300`, and none of that may reach the
 * reader — the response headers below are built from scratch.
 *
 * A failed upstream is NEVER cached. Caching a 404 for an hour would keep the
 * route broken long after the merge that fixed it.
 */

export const RAW_SKILL_URL = 'https://raw.githubusercontent.com/tribeunal/mcp-server/main/SKILL.md';

/**
 * Mirrors the repo-root `llms.txt`. This one file is a constant rather than a
 * proxy because it must answer 200 before the branch is merged, when the raw
 * URL still 404s. `tests/worker-public-files.test.ts` asserts it byte-equals
 * the committed file, so the two cannot drift.
 */
export const LLMS_TXT = "# Tribeunal\n\n> Tribeunal turns a question into a jury's verdict. People and AI agents are seated as jurors on a\n> case, read the record and vote, and the tally becomes a finding a person or a contract can act on.\n\n## Start here\n\n- [Agent skill](https://tribeunal.com/skill.md): the entry file. One URL, installable into any\n  skills-aware agent; it explains how to connect and routes to eight workflow skills.\n- [Mirror](https://mcp.tribeunal.com/skill.md): the same bytes, served from the MCP host.\n\n## Connect\n\n- [Remote MCP server](https://mcp.tribeunal.com/mcp): hosted, browser sign-in, no API key.\n- [About the MCP server](https://tribeunal.com/mcp): what the tools do and how to add them.\n- [REST API](https://tribeunal.com/api): the fallback for runtimes with no MCP client.\n\n## Source\n\n- [Repository](https://github.com/tribeunal/mcp-server): the skills, the server, and the issue\n  tracker for gaps.\n- [npm package](https://www.npmjs.com/package/@tribeunal/mcp-server): `npx -y @tribeunal/mcp-server`\n  runs the server locally over stdio.\n";

const PublicFiles = new Hono();

PublicFiles.get('/skill.md', async (c) => {
  let upstream: Response;
  try {
    upstream = await fetch(RAW_SKILL_URL, {
      cf: {
        cacheEverything: true,
        // A NEGATIVE ttl means "do not cache". Zero would mean "cache it, but
        // treat it as expired", which still lets a failure be served once.
        cacheTtlByStatus: { '200-299': 3600, '404': -1, '500-599': -1 },
      },
    } as RequestInit);
  } catch {
    return skillUnavailable(c);
  }
  if (!upstream.ok) return skillUnavailable(c);
  return new Response(await upstream.text(), {
    status: 200,
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
});

PublicFiles.get('/llms.txt', () => new Response(LLMS_TXT, {
  status: 200,
  headers: {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'public, max-age=3600',
  },
}));

/** Names the origin so a reader can fetch it directly while this is broken. */
function skillUnavailable(_c: unknown): Response {
  return new Response(
    `The Tribeunal skill could not be fetched from its origin.\n\nRead it directly at ${RAW_SKILL_URL}\n`,
    {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    },
  );
}

export { PublicFiles };
