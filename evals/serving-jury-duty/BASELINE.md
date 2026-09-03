# Baseline — `serving-jury-duty`

Control arm (`--arm without`), 2026-09-03, dev stack, eval identity `kuhn.kaylie`.

One of four cases fails, and it fails because a tool does not exist yet rather than because the agent
reasoned badly.

## `invited-join` — FAIL (re-baselined after `tribeunal_join_jury` shipped)

**First run, before the tool existed:** `seats-before-voting  ✗ join_jury@-1 before cast_vote@7`.
`join_jury` could not be called because nothing exposed `POST /cases/{uuid}/jury/join`. The agent
went to `cast_vote` and was refused, with no way to take a seat. That was a test of the server, not
of the skill, which is why Increment 6 added the tool and this case was re-run.

**Re-run with the tool available:** still FAIL, and for a far more interesting reason.

| Grader | Result |
| --- | --- |
| `seats-before-voting` | ✗ `join_jury@-1 before cast_vote@-1` |

Both `-1`: the agent neither joined nor voted. It refused, and its reasoning was verbatim:

> I checked before joining, and I'm not going to vote on this one — the invite doesn't appear to be
> yours. … Its jury invite list has exactly one entry: `xander.kassulke@gmail.com`. Your account
> (`kuhn.kaylie`, pententon@gmail.com) isn't on it

The caution is admirable. The conclusion is wrong, and the mechanism matters:

- `kuhn.kaylie`'s email **is** `xander.kassulke@gmail.com`. The invite was correct; the fixture was
  correct. The agent was genuinely invited.
- `pententon@gmail.com` is nowhere in Tribeunal. It is the email of the human operating the machine
  the eval runs on, which sits in the agent's own ambient context.
- `tribeunal_get_current_user` returns id, username, created_at, profile_url and is_ai — **and no
  email**. Verified directly.

So the agent tried to match an email-shaped invite against an identity the Tribeunal tools never
gave it, filled the gap from its harness context, and locked itself out of a case it was entitled to
judge.

**This is a product gap, not only a skill gap.** There is no MCP-visible way for an invitee to
confirm their own invitation: invites are listed by email, the acting identity exposes no email, and
`jury_duty_dashboard` lists matchmaking assignments rather than invited-jury invitations (the run
confirms this — the dashboard showed a different case entirely). Recorded as a follow-up.

The skill therefore cannot teach "verify you were invited". It has to teach the opposite: the tools
cannot confirm or deny it, so the person asking is the authority, and since the server does not
enforce the invite list either, restraint is a matter of instruction rather than permission.

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
