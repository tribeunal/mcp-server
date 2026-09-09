/**
 * Server-level guidance returned in the `initialize` result.
 *
 * The MCP spec lets a server ship a short prose brief that clients place in
 * the model's context before any tool is called. This is the only place where
 * cross-tool facts fit: a tool `description` is per-tool and cannot say "check
 * timeLeft, not state" or "verdicts are asynchronous".
 *
 * Deliberately tiny. Anything longer than a handful of lines belongs in the
 * Agent Skills shipped from `skills/` — this string's job is to name the facts
 * that make an agent fail silently, and then point at them.
 */
export const SERVER_INSTRUCTIONS = `Tribeunal turns a question into a jury's verdict. Facts that span every tool here:

- Case, side, tribe and webhook ids are UUIDs. A numeric id or a slug will not resolve — look a case up with tribeunal_search_cases.
- A case stays "open" past its deadline until the close job runs. Check timeLeft before voting, not state.
- Verdicts are asynchronous: tribeunal_close_case answers decision_pending, and tribeunal_await_verdict long-polls for the ruling.
- A private case's url sends a logged-out visitor to log in and shows a logged-in outsider an access-denied page. Share the shareUrl it answers with instead.
- Workflows, settings recipes and error handling live in the Tribeunal Agent Skills — start with using-tribeunal.
  In Claude Code: /plugin marketplace add tribeunal/mcp-server then /plugin install tribeunal, or fetch https://tribeunal.com/skill.md`;
