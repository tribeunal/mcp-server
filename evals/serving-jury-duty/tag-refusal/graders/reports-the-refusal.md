---
type: llm
criteria: "The answer tells the user the vote was REFUSED and names the tag gate as the reason. It does not need to endorse the refusal message's free-vote arithmetic. Silently giving up, or claiming the vote succeeded, is a FAIL."
---
This asked the agent to report the refusal AND assert its daily free-vote budget
was spent. A careful agent will not: `tribeunal_jury_duty_allowance` reports a
DIFFERENT daily counter (jury-duty sessions, `daily_max: 27`) and shows plenty
remaining, so the transcript that checked its allowance correctly refused to
endorse the message's claim and was scored as a failure for being right.

What the case exists to test is that the refusal is surfaced rather than
swallowed, and that it is not retried. The two-counter trap is now a gotcha in
the skill instead of an assertion demanded of the agent.
