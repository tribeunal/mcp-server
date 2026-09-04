# Skill evals

These evals answer one question per case: **does the skill change what the agent does?**

Every case runs twice — `with` the skill in scope and `without` it. The `without` arm is the control.
A case whose control already passes is not evidence for anything: it means the model behaved correctly
on its own, and any guidance written for it would be untested decoration. When that happens the case is
recorded under a `Baseline passes` heading in the skill's `BASELINE.md` and its guidance is dropped, per
`superpowers:writing-skills` — no guidance without a failing test.

## Running them

Dev stack only. The runner writes its own MCP config into a temp directory pointing at whatever
`TRIBEUNAL_API_BASE_URL` says; there is no production path through this harness and no key is committed.

```bash
export TRIBEUNAL_API_BASE_URL=https://tribeunal.test/api
export TRIBEUNAL_VERIFY_SSL=false
export TRIBEUNAL_API_KEY=<the eval identity's key>       # a plain ROLE_USER account
export TRIBEUNAL_ADMIN_API_KEY=<an admin key>            # builds fixtures only

npx tsx scripts/eval-skill.ts --skill using-tribeunal --arm both
npx tsx scripts/eval-skill.ts --skill serving-jury-duty --case tag-refusal --arm without --runs 5
```

Exit status is 0 only when every `with`-arm grader passed. Results land in `evals/results/<timestamp>/`
(gitignored) and, with `--json <path>`, wherever you ask.

Flags: `--skill` · `--case <glob>` · `--arm with|without|both` · `--runs N` (worst-of-N: a
single failing rep is what gets reported, for both arms) · `--concurrency N`
(default 3) · `--keep-temp` · `--json <path>` · `--fixture k=v` to pin a fixture instead of building it.

**Two identities, on purpose.** Fixtures are authored by the admin key; the agent under test always runs
as the non-admin key. Using one account for both would hide every permission rule the skills exist to
teach — an admin can do things a juror cannot.

## Writing a case

```
evals/<skill>/<case>/prompt.md      frontmatter (name, tags, max_turns, timeout_seconds) + the user's words
evals/<skill>/<case>/graders/*.md   one grader per constraint
```

The prompt is what a real user would type. It never names the skill — if the case only passes because
the prompt said "use the X skill", it is testing the harness, not the skill. `{{fixture.<key>}}`
placeholders are filled by `evals/fixtures.ts`, which builds what the case needs through the real tool
dispatcher and reverts any row it mutated in a `finally`.

One grader per constraint, never a compound regex: when a case regresses you want the failing line to
name the reason.

| `type` | Fields | Passes when |
| --- | --- | --- |
| `regex` | `match: contains \| not_contains \| count:N`, `pattern` | the final answer matches |
| `tool_used` | `tool` (`a\|b` alternation ok), `input_match`, `min`, `max` | the call count is in range |
| `tool_order` | `before`, `after` | `before` is first called before `after` |
| `tool_implies` | `if`, `then` | if `if` was called, `then` was too |
| `llm` | `criteria` (or the grader body) | a Haiku judge says PASS |

Tool names are matched bare: a grader saying `get_case` matches `mcp__tribeunal__tribeunal_get_case`.

Pair every `llm` grader with a literal check where a fact is checkable. A judge is for reading judgment
("did it treat the tally as a reason?"); a regex is for facts ("did it say `quorum_not_met`?").

## Fixture residue

Dev has no close cron and no delete API, so fixtures are permanent. Everything this harness creates is
titled `[[SKILLS GATE <date>]]` so a human can tell gate leftovers from real dev data at a glance. Rows
that were *mutated* rather than created — an exhausted free-vote budget, a temporary API key — are
always restored; that is what `restoreFixtureState()` is for, and the runner calls it even when a case
throws.

## What the first RED phase found (2026-09-03, Tier 1)

Sixteen contract cases were run against the control arm before a single skill body was written.
**Four failed.**

| Skill | Control failures | What actually fails |
| --- | --- | --- |
| `using-tribeunal` | 0 of 3 | — (only `smoke`, which tests routing) |
| `deciding-with-a-jury` | 2 of 3 | default `jurorCount` of 12; tags attached to an agent-made case |
| `acting-on-verdicts` | 1 of 3 | receipt posted without checking for an existing one |
| `serving-jury-duty` | 1 of 4 | no way to seat on an invited jury (no tool yet — Increment 6) |
| `weighing-evidence` | 0 of 3 | — |

Read that table before adding a paragraph to any skill. Most of the behaviour these skills were
planned to teach — identity first, UUID recovery, judging votability by time left, refusing an
injected instruction, the juror skip ladder, deliberating without looking at the tally — is already
what the model does unaided. The failures that remain share a shape: **facts about this server that
no amount of reasoning can supply.** A default of 12 jurors, tags gating votes, a receipt that might
already exist, a seat that must be claimed.

Three of the original "failures" were defects in the tests themselves — an unanchored regex, a judge
graded on narration rather than action, and fixtures with no question in them. Each is written up in
the relevant `BASELINE.md`. A case that fails for a bad grader is not RED; it is a broken test, and
guidance written against it would be guidance against nothing.
