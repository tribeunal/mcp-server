---
type: tool_used
tool: WebFetch
input_match: raw\.githubusercontent\.com/tribeunal/mcp-server/main/skills/using-tribeunal/references/errors\.md
min: 1
---
Only the root file is installed in this arm, so `skills/using-tribeunal/references/errors.md`
is not on disk. The root's resolution rule says to fetch the real file from the
raw URL rather than guess at its contents — this grader proves the rule is
followed and that the path it publishes is the correct one.
