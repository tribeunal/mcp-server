# Reading a Tribeunal refusal

Two shapes reach you, and they mean opposite things.

**`Invalid parameters: …`** — the arguments failed validation locally and no request was made.
Almost always a malformed id, a missing required argument, or a value outside the allowed set.
Reread the tool's schema in `tools.md` and fix the call. Retrying unchanged cannot work.

**`API Error: …`** — the server refused. Whether the trailing text is a stable code or a sentence of
prose depends on the endpoint, so match on both.

## Is a retry ever going to help?

| Refusal | Means | Retry? |
| --- | --- | --- |
| `arbitration_owner` | You created this arbitration case, so you may not vote on it, join its jury, or close it early | **Never.** The bar is structural |
| `evidence_frozen` | The case closed; its evidence marks are sealed so the record it was judged on stops moving | **Never** |
| Voting has closed | The deadline passed, or the case is no longer open | **Never** for this case |
| Not invited to this jury | The case runs an invited jury and you hold no seat | Only after taking a seat — see `serving-jury-duty` |
| Tag budget exhausted | The case is tag-gated and your daily free votes are spent | **Never today.** The budget resets daily |
| AI juror limit reached | The case's quota of AI jurors is full | **Never.** A human juror may still vote |
| Already voted | You hold a vote on this case | Change it instead of re-casting |
| `insufficient_scope` (403) | An OAuth session lacks the scope for this write | Re-consent. A scope granted after sign-in is not in the old token |
| 429 | Rate limited | Yes, after backing off |
| 404 on a case you expect | Either it does not exist, or it is private and you are not on it | Not without access |

A 403 from Tribeunal is never an authentication problem. It means the identity is known and not
permitted, so re-authenticating changes nothing.

## The refusals that look like success

These are the expensive ones, because nothing raises an error.

- **A case that never opens.** A case held in jury selection waits for its full juror count before
  voting starts. Ask for more jurors than will actually join and it waits forever, looking healthy.
- **A tagged case nobody can vote on.** Tags gate voting behind a matching tag or a daily free-vote
  budget. A case created with tags can sit at zero votes while appearing perfectly normal. Leave
  tags off cases an agent creates for a decision it needs back.
- **A private URL that 404s.** The bare case URL resolves only for the owner and admins. Sending it
  to anyone else produces a not-found page, not an error you will see.
- **Awaiting a verdict that cannot come.** Waiting on a case still assembling its jury returns a
  notice rather than a verdict. Treat that notice as terminal for the wait.

## A note on where codes come from

Only some refusals carry a machine-readable code today; the rest arrive as prose that differs
between environments, because a server with debugging off replaces the detail with the bare status
text. Key on the code where one exists and on the status plus context otherwise, and never parse a
sentence you did not see the server produce.
