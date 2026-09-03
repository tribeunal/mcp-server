# Baseline — `deciding-with-a-jury`

Control arm (`--arm without`), 2026-09-03, dev stack, eval identity `kuhn.kaylie`.

Two of three cases fail without the skill. Both failures are settings the model has no way to guess:
nothing in the tool schemas says that a default jury never fills a quick ruling, or that tags gate
voting.

## `fast-ai-ruling` — FAIL

Prompt: a quick AI ruling on renaming a live Postgres table.

| Grader | Result |
| --- | --- |
| `small-jury` | ✗ `create_case input~/"jurorCount":\s*[2-5]\b/ n=0` |
| `no-tags` | ✗ `create_case input~/"tags"/ n=1` |
| `all-ai-allowed` | · passed |
| `short-window` | · passed |
| `waits-or-hands-off` | · passed |

The agent asked for a short window and 100% AI jurors — it understood "quick" — but left
`jurorCount` at its default of 12 and attached tags. Both are silent failures:

- **12 jurors.** The default is fine for a public community case and fatal for a fast one. The
  agent never named a juror count at all, so it never had the thought.
- **Tags.** A tagged case gates voting behind a matching tag or a daily free-vote budget. An
  agent-created case with tags can therefore sit unvoted while looking perfectly healthy. The
  agent had no reason to suspect this; tags read like harmless categorisation.

Note: `finalText` was empty for this run — the case spent its turn budget on await calls. The two
failures above are tool-input graders and are unaffected.

## `team-vote-settings` — FAIL

Prompt: a decision from three named teammates, invisible to everyone else.

| Grader | Result |
| --- | --- |
| `invited-jury` | ✗ `create_case input~/"juryType":\s*"invited"/ n=0` |
| `private` · `jurors-match-invitees` · `invites-them` · `shares-share-link` | · all passed |

The agent got the hard parts right — private visibility, `jurorCount: 3` matching the three
teammates, an invite call, and a share link rather than the bare url. It never set `juryType`,
relying on the server defaulting a private case to an invited jury. That works today, and it is
exactly the kind of implicit dependency a settings recipe should make explicit.

## `link-poll` — PASS

## Baseline passes

`link-poll` passes without the skill: asked to poll people who have no accounts and to keep it out
of public listings, the agent set `allowsGuestVotes: true` and `visibility: "private"` unaided. No
guidance for the link-poll shape is justified beyond naming it as a recipe.
