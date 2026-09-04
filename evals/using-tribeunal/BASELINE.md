# Baseline — `using-tribeunal`

Control arm (`--arm without`), 2026-09-03, dev stack, eval identity `kuhn.kaylie`.

## `smoke` — FAIL

The one case in this suite that fails without the skill, and the reason the skill exists:

| Grader | Control | With skill |
| --- | --- | --- |
| `loads-the-skill` | ✗ `Skill input~/using-tribeunal/ n=0` | · `n=1` |

Verbatim: the control arm never invoked the skill, because there was none to invoke. It tests the
only thing the three contract cases cannot — that the entry point **loads and routes** — and it is
what makes this a router rather than a document nobody opens.

## Baseline passes

**All three contract cases pass without the skill.** Under the Iron Law of
`superpowers:writing-skills`, none of the three behaviours they test justifies guidance in the skill
body. They stay in the suite as regression tests — they pin behaviour that is currently free and
would otherwise silently rot — but they are not the argument for this skill's existence.

| Case | Control verdict |
| --- | --- |
| `identity-first` | PASS — resolves the caller before filtering "mine" |
| `non-uuid-id` | PASS — never retries the bad id, explains and searches instead |
| `votable-discovery` | PASS — judges votability by time left, not by status |

### `identity-first`

The first version of this prompt ended "...and sign off with my username", which handed the agent
the very tool call the grader was watching for. It was rewritten mid-RED to *"Find me three cases I
could vote on right now. Leave out anything I created myself"*, where identity is needed but never
named. It still passed: `get_current_user n=1`, and the answer offered only cases with time left.

### `non-uuid-id`

Asked to "get me case 878", the agent never called `get_case` with `878` at all (`n=0`) — it went
straight to searching. Verbatim:

> Tribeunal's `get_case` only takes the case UUID, and a numeric id or slug won't resolve

### `votable-discovery`

Verbatim from the judge:

> showing 20 cases with `status=open` where 19 have `timeLeft: 0` and are unvotable, with clear
> explanation that status remains "open" because "the close job" hasn't run yet

## What this skill is still for

The `smoke` case is the one that fails without the skill (`Skill input~/using-tribeunal/ n=0`), and
it tests the thing the three contract cases cannot: that the entry point **loads and routes**. The
value of `using-tribeunal` is therefore routing, vocabulary and the error catalogue — not
re-teaching discovery behaviour the model already has.

Consequence for the GREEN phase: keep the body at the router end of its budget. Every sentence of
discovery advice added here is untested by construction.
