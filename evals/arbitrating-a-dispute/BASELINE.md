# Baseline — `arbitrating-a-dispute`

Control arm (`--arm without`), 2026-09-03, dev stack, eval identity `kuhn.kaylie`.

## `arbitration-create` — FAIL

Prompt: two contractors disputing a 4,000 EUR invoice, *"I need a binding ruling our contract can
point at."*

| Grader | Result |
| --- | --- |
| `arbitration-on` | ✗ `create_case input~/"arbitrationMode":\s*true/ n=0` |
| `real-quorum` | ✗ `create_case input~/"minVotes":\s*([2-9]\|[1-9][0-9])\b/ n=0` |
| `states-requirement` | ✗ `create_case input~/decisionRequirement/ n=0` |
| `no-guest-votes` · `no-tags` | · passed (nothing was set) |

The agent made an ordinary case. Asked for a ruling something outside the platform would rely on, it
reached for none of the three settings that make a verdict binding: the mode itself, a quorum above
one, and a stated level of agreement. The case it built would have settled a 4,000 EUR dispute on a
single vote, with the owner free to vote in it.

Nothing in the tool schemas connects "binding" to `arbitrationMode`, so this is a fact about the
product rather than a reasoning failure — exactly the shape of gap a skill closes.

## Baseline passes

| Case | Control verdict |
| --- | --- |
| `owner-cannot-vote` | PASS — recognises the owner bar, does not retry |
| `void-recovery` | PASS — reports no ruling and proposes a wider re-run |

### `owner-cannot-vote`

`cast_vote n=0`. The agent checked the identity, saw it owned the arbitration case, and declined
rather than attempting and reporting a refusal.

### `void-recovery`

Verbatim from the judge:

> The answer explicitly states there is no ruling ("**There is no ruling.**"), proposes specific
> re-running changes that would help (a longer voting window of 24–48h instead of 1h, and optionally
> dropping the quorum from 5 to 3), and crucially does not name a winning side

Void handling is therefore already correct, and this skill documents it because it owns the recovery
path, not because the model was getting it wrong.

## What GREEN changed in the skill

The first version made the case worse. With the skill loaded the agent did the intake properly —
drafted three remedies as sides, priced each one — and then **stopped to ask for facts instead of
filing**, because the skill said to get both parties' positions "before writing anything". Verbatim:

> Before I create it, one thing genuinely blocks: in arbitration the description *is* the whole
> brief, and right now I have two assertions and no facts.

The reasoning is sound and the behaviour is wrong for an agent working unattended: the prompt
carried a describable dispute — two positions and two remedies — and a case that names its own
evidentiary gaps is more useful than no case. Blocking belongs where proceeding would be unsafe or
useless, not where the brief is merely thin.

The intake step is now a conditional on an observable predicate rather than a precondition: build
the brief from what you were given, name the gaps inside the description, and stop only when there
is no describable dispute at all. All three settings then land.
