# Baseline — `convening-a-team-jury`

Control arm (`--arm without`), 2026-09-03, dev stack, eval identity `kuhn.kaylie`.

## Baseline passes

**All three cases pass without the skill.** No guidance here is justified by a failing test, so the
skill is written as a reference for the tribe surface — the thing `using-tribeunal` routes to when a
named group should decide — rather than as a correction.

| Case | Control verdict |
| --- | --- |
| `tribe-to-jury` | PASS — private tribe, invites, private invited case with K matching the team, share link |
| `resolve-tribe` | PASS — resolves tribes before reading a roster, reports the chieftain separately |
| `leave-warning` | PASS — refuses to leave unprompted and explains the invitation is consumed |

### `tribe-to-jury`

Every grader passed unaided: `create_tribe` with `isPublic: false`, `invite_tribe_members`, a
private case with `jurorCount: 3` matching the three named teammates, and a share link rather than
the bare url in the answer.

### `resolve-tribe`

`list_tribes@2 before list_tribe_members@3` — it resolved names to ids before reading a roster.
Verbatim from the judge:

> The agent explicitly identifies the chieftain separately for each tribe … then lists members
> distinctly below with "(member)" designation

### `leave-warning`

`leave_tribe n=0`. Verbatim:

> The agent clearly warns that leaving a private tribe consumes the invitation and rejoins require a
> fresh invite, explicitly asks for user confirmation … then goes even further by surfacing an
> ownership concern before acting.

## Fixtures these cases needed

Both roster cases were meaningless before this run: the eval identity belonged to no tribe and owned
none, so "who is in my tribes" answered "none" and there was nothing to leave. `resolve-tribe` now
builds a tribe the identity owns with the admin joined as an ordinary member — so the roster has
someone who is not the chieftain, which is the distinction the case checks — and `leave-warning`
builds a private tribe owned by the admin that the identity has joined, so leaving really would
consume its invitation.

## What GREEN added, and why the skill is not empty

The baseline passing 3/3 would normally cap this skill at reference prose. GREEN found two facts the
tools emit but never explain, and both changed what the skill has to say.

**Privacy is an unlabelled integer.** `tribeunal_list_tribes` returns `type: 2` for a private tribe
and `type: 1` for a public one, with nothing in the response saying which is which. The case failed
until the skill carried the legend — and it failed on a transcript where the agent had *correctly*
reused an existing private tribe but could not demonstrate it was private, because the tool never
told it.

**`owner` is a constant.** Every tribe serialises `owner` as `/api/users/me` regardless of who owns
it — the known IRI bug, confirmed live here. An agent reading it to decide ownership gets the same
answer for every tribe.

## Two defects this increment exposed, neither in the skill

**A judge that could not run was scored as a judge saying no.** `resolve-tribe` failed with the
grader detail `You've hit your session limit · resets 3pm (Europe/Belgrade)` — a usage limit
recorded as the reason a skill failed. The runner now throws when the judge returns no verdict, so
infrastructure trouble stops looking like evidence.

**A fixture that accumulated changed another case.** `resolve-tribe` created a fresh private tribe
on every run, so the eval identity came to own four near-identical ones. `tribe-to-jury` then
sensibly reused one instead of creating its own, and its `create_tribe` grader scored that as a
failure. The better behaviour looked like the bug. The fixture now reuses an existing gate tribe,
and the grader asks what the case actually cares about — that the group backing the jury is private
— rather than demanding a particular tool call.
