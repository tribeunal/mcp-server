# Tribeunal webhook events

## Headers on every delivery

| Header | Use |
| --- | --- |
| `X-Tribeunal-Event` | The event name, e.g. `case.closed` |
| `X-Tribeunal-Delivery` | Unique per delivery attempt's payload — **deduplicate on this** |
| `X-Tribeunal-Timestamp` | Unix seconds, and half of what the signature covers |
| `X-Tribeunal-Signature` | `v1=<hex>` — see the skill for how it is computed |

Delivery is at-least-once. The same event can arrive twice, so a receiver that acts on every POST
will act twice; one that records the delivery id first will not.

## The events

| Event | Fires when | Notes |
| --- | --- | --- |
| `case.opened` | A case starts accepting votes | Also fires on reopen, so treat it as "open now", not "new" |
| `case.closed` | A case reaches a terminal state | Carries the verdict block, identical to what the await tool returns — including the outcomes that are not rulings |
| `vote.cast` | Someone votes | A vote's rationale rides here as `comment`; it does **not** also raise `comment.created` |
| `vote.revoked` | A voter withdraws | The tally moves down |
| `comment.created` | A standalone comment | Vote rationales are the exception above |
| `evidence.marked` | A comment or file is promoted to evidence | |
| `evidence.unmarked` | A mark is removed | Cannot fire after close — marks freeze |
| `jury.joined` | A juror takes a seat | On a wait-mode case, the one that eventually opens it |
| `ping` | You asked for it | **Delivered regardless of subscriptions** — a successful ping proves reachability and signing, not that your event list is right |

## Two that mislead

**`ping` ignores your subscription list.** It is a connectivity test, so a working ping on an
endpoint subscribed to nothing at all still succeeds. If real events never arrive after a good ping,
the subscription list is the first thing to check.

**`case.closed` does not mean decided.** The verdict block it carries can report no ruling — a
failed quorum, or a failed agreement requirement. A receiver that reads a winning side without
checking whether the case decided anything will act on a case that decided nothing. `acting-on-verdicts`
covers reading it.

## Receiver contract

- Answer **2xx within a few seconds**. Slow receivers are treated as failures and retried.
- Acknowledge first, work afterwards. Verify the signature, record the delivery id, return 200, and
  then do the job — a receiver that finishes the work before answering invites a duplicate.
- Failures are retried a few times and then given up on. A receiver that was down for a while has
  gaps, so reconcile by reading the case rather than assuming the feed was complete.

## Limits

Ten endpoints per owner; the eleventh is refused. Endpoints are owner-scoped — you only ever see
and target your own. URLs must be https and public: the server refuses private, loopback and
carrier-grade-NAT addresses, so a receiver on your laptop needs a tunnel with a public hostname.
