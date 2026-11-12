# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to dist/
- `npm start` - Run compiled production code
- `npm run lint` - Run ESLint with TypeScript rules
- `npm run format` - Format code with Prettier

### Testing
- `npm run test:unit` - Run the test suite (`tests/**/*.test.ts` on Node's built-in test runner via `tsx`). This is what CI runs; it needs Node 21+, which expands the glob itself.
- `npm test` is a leftover Jest script with no config: every suite fails. Don't use it.

## Architecture Overview

This is a **Model Context Protocol (MCP) Server** that provides programmatic access to the Tribeunal platform - a community-driven decision-making system. The server enables AI agents to interact with Tribeunal's voting, trial management, and community features.

### Key Components

**Entry Point**: `src/index.ts` - MCP stdio transport setup; builds the API client from env (`src/client/from-env.ts`)
**Shared core**: `src/core/tools.ts` - `TOOL_DEFINITIONS` (every tool) and `dispatchToolCall` (Zod validation, API calls, response text), used by both transports. `src/core/stdio-register.ts` registers them on the stdio `Server`; `src/core/instructions.ts` holds the server instructions
**API Client**: `src/client/api-client.ts` - Axios-based HTTP client with Bearer token auth
**Tools**: `src/tools/` - Zod schemas and result helpers organized by domain:
- `cases.ts` - Cases (the UI name for trials)
- `votes.ts` - Voting system
- `sides.ts` - Side images
- `comments.ts` - Comments and evidence
- `activity.ts` - Activity feed and the long-poll await tools
- `jury-duty.ts` - Jury duty, joining and leaving a jury, inviting jurors
- `tribes.ts` - Community management
- `users.ts` - User profiles
- `webhooks.ts` - Webhook endpoints
- `disputes.ts`, `deals.ts` - Disputes and escrow deals
- `uuid.ts` - UUID validators shared by the others

**Ruling verification**: `src/verify/` - the offline verifier behind `tribeunal_verify_ruling`

> `src/server.ts`, `src/auth/auth.ts` and `src/utils/format.ts` are leftovers that nothing imports. Don't extend them.

### Authentication
- Uses Bearer token authentication via `TRIBEUNAL_API_KEY` environment variable
- API client in `src/client/api-client.ts` handles auth headers automatically
- SSL verification configurable via `TRIBEUNAL_VERIFY_SSL` env var (`false` disables it)

### Data Flow
1. Tool schemas are defined in `src/tools/` with Zod; `src/core/tools.ts` collects them into `TOOL_DEFINITIONS`
2. `src/core/stdio-register.ts` (stdio) and `worker/src/mcp-agent.ts` (Worker) register those definitions
3. `dispatchToolCall` in `src/core/tools.ts` validates each request and calls the API client in `src/client/api-client.ts`, which makes authenticated HTTP calls
4. `dispatchToolCall` builds the response text, with per-domain result helpers from `src/tools/`

### Cloudflare Worker (`worker/`)

A remote, **Auth0-authenticated** deployment of the Tribeunal MCP tools as a Cloudflare
Worker. Each caller logs in via Auth0 Universal Login and every tool call runs **as that
user** against the Tribeunal API. It exposes the same tools as the stdio server through a
shared, transport-agnostic core (`src/core/tools.ts`, `src/client/api-client.ts`).

**Entry Point**: `worker/src/index.ts` - `OAuthProvider` wiring (`/sse` + `/mcp` handlers,
Auth0 `defaultHandler`); re-exports the `TribeunalMCP` Durable Object.
**Config**: `worker/wrangler.jsonc` - DO binding `MCP_OBJECT`, `OAUTH_KV` namespace,
non-secret `vars`, `nodejs_compat`.
**Authoritative docs**: `worker/README.md` (architecture, Auth0 contract, secrets).

Built on `@cloudflare/workers-oauth-provider` + the `agents` SDK (`McpAgent`) + Hono, using
`axios` for API calls (with `nodejs_compat`). Auth secrets are set via `wrangler secret put`
(`AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_AUDIENCE`,
`COOKIE_ENCRYPTION_KEY`); `TRIBEUNAL_API_BASE_URL` and `AUTH0_SCOPE` are non-secret `vars`
in `wrangler.jsonc`.

> The older `workers-mcp` / JSDoc-docgen worker is gone — **do not run `workers-mcp docgen`**.

#### Worker Commands
- `cd worker && npm run dev` - Local development (`wrangler dev`)
- `cd worker && npm run deploy` - Deploy to Cloudflare (`wrangler deploy`)
- `cd worker && npx wrangler secret put <NAME>` - Set a production secret
- `cd worker && npx wrangler types` - Regenerate Cloudflare runtime types after a `wrangler.jsonc` change

**Deploying to production:** follow the **`/deploy-worker` skill**
(`.claude/skills/deploy-worker/SKILL.md`) — it is the single source of truth for the deploy
procedure, required KV/secrets/Auth0 config, verification, and gotchas. Keep that skill and
`worker/README.md` in sync; do not duplicate deploy steps here.

### Error Handling
- Custom `TribeunalAPIError` class for API errors (stdio server)
- Workers throw errors with status code and response body
- Comprehensive error propagation through MCP protocol
- Request/response interceptors in API client

## Related Repositories

**Main Tribeunal Application**: [pentarim/tribeunal](https://github.com/pentarim/tribeunal)
- Contains the core Tribeunal platform implementation
- Web application with user interface and API endpoints
- Database models and business logic
- Useful for understanding the full system architecture and API contracts

## Development Notes

### Environment Setup
- Requires Node.js 18+
- Uses TypeScript with strict mode and ES2022 target
- Environment variables in `.env` file (see `.env.example`)

### Code Organization
- Modular tool architecture allows easy extension
- Type-safe parameter validation with Zod
- Consistent error handling patterns
- ESM modules throughout

### Key Dependencies
- `@modelcontextprotocol/sdk` - MCP protocol implementation (stdio server)
- `@cloudflare/workers-oauth-provider` + `agents` (`McpAgent`) + `hono` - Auth0 remote MCP worker
- `axios` - HTTP client (stdio server)
- `zod` - Schema validation (stdio server)
- `dotenv` - Environment management (stdio server)
- `wrangler` - Cloudflare Workers CLI (worker)

### Testing
- Tests live in `tests/*.test.ts` and run with `npm run test:unit` (Node's test runner through `tsx`)
- CI (`.github/workflows/ci.yml`) builds, runs those tests, and type-checks the worker
- The `jest` dev dependency and the `npm test` script are unused leftovers