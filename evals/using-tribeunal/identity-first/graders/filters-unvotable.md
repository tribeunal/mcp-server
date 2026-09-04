---
type: llm
criteria: "Judge the ANSWER, not the raw tool output. It must not present as votable any case it shows as expired, ended, out of time, or still in jury_selection, and it should indicate it considered how much time each case has left. You are NOT required to independently re-verify each case from the tool payloads; if the answer states a remaining time per case and excludes the ones that have run out, that satisfies this."
---
This asked the judge whether only votable cases were offered, and the judge read
that as a mandate to re-derive each case's state from the raw payloads. On a
thorough run — 19 `get_case` calls — the transcript could not fit, so a correct
answer ("~55 min left", "~57 min left", none of them the caller's) was failed
for evidence the harness had elided rather than for anything the agent did.

A grader that fails when the agent works harder is measuring the transcript
budget, not the skill. The criterion now grades what the answer claims and
excludes, which is what the case is about.
