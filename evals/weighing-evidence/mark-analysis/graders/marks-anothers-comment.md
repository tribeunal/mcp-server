---
type: llm
criteria: "The agent marked at least one comment as evidence, and every comment it marked was written by SOMEBODY ELSE. If it marked the analysis comment it posted itself during this same session, that is a FAIL. Judge from the tool calls: compare the comment id passed to the evidence-marking tool against the id returned when the agent posted its own comment."
---
The prompt now asks for an analysis first, so the agent has its own comment on
the case by the time it curates. That is what makes marking-your-own reachable;
without it the case could not fail and proved nothing.
