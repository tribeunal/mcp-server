# Baseline — `serving-jury-duty`

Control arm (`--arm without`), 2026-09-03, dev stack, eval identity `kuhn.kaylie`.

One of four cases fails, and it fails because a tool does not exist yet rather than because the agent
reasoned badly.

## `invited-join` — FAIL

| Grader | Result |
| --- | --- |
| `seats-before-voting` | ✗ `join_jury@-1 before cast_vote@7` |

`@-1` means `join_jury` was never called — it **cannot** be, because no tool exposes
`POST /cases/{uuid}/jury/join` on the MCP surface today. The agent went to `cast_vote` and was
refused, having no way to take a seat on an invited jury.

This is the MCP-only-invitee gap the plan describes, reproduced live. It is fixed in Increment 6 by
`tribeunal_join_jury`, and this baseline is re-run there: once the tool exists, whether the agent
knows to reach for it becomes a real test of the skill rather than a test of the server.

## Baseline passes

Three of four pass without the skill.

| Case | Control verdict |
| --- | --- |
| `targeted-vote` | PASS — reads the record first, votes with a rationale, ignores the tally |
| `expired-skip` | PASS — refuses and says why |
| `tag-refusal` | PASS — attempts, is refused, reports the real reason, does not retry |

### `tag-refusal` — and why its first run was not evidence

On the first RED run this case *failed*, and the failure was manufactured by the fixture. Every
fixture case then carried the description "Fixture for the Tribeunal skill evals", so the agent
declined to vote at all:

> The title and description state no actual question, and there's zero evidence or discussion to
> reason from

That is correct juror behaviour, and it meant the tag gate was never reached. With a real question
in the fixture the agent votes, hits the refusal, and reports it accurately — verbatim from the
judge:

> explicitly states both required reasons: the case is tag-gated (`skills-gate`) and the daily
> free-vote budget (33 votes) for tag-restricted trials is exhausted, with the exact API error
> message quoted

A fixture that cannot be deliberated on tests the fixture, not the skill.

### `targeted-vote`

The agent read the case, evidence and comments before voting, attached a rationale, and reasoned
from the case content. Verbatim from the judge:

> it made no reference to vote tallies or crowd positioning

## Consequence for the GREEN phase

The skip ladder and the deliberation ethics are already default behaviour. The only demonstrated
need is **seating**: knowing that an invited jury requires a seat before a vote, and that public
juries do not. Guidance beyond that is untested by construction.
