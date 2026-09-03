---
type: tool_used
tool: Skill
input_match: using-tribeunal
min: 1
---
The entry-point skill must actually load. This grader exists to prove the
harness isolates arms: a bare `tool_used: Skill` would pass in both arms,
because built-in skills fire regardless. Keying on the skill NAME is what
makes the `without` arm fail.
