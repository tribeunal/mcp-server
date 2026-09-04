# Baseline — `acting-on-verdicts`

Control arm (`--arm without`), 2026-09-03, dev stack, eval identity `kuhn.kaylie`.

## `await-and-receipt` — FAIL

Prompt: find out what the jury decided on a settled case, then record what we are doing about it.

| Grader | Result |
| --- | --- |
| `reads-before-writing` | ✗ `list_comments@-1 before post_comment@3` |
| `await-not-hammered` | · `await_verdict n=1` |
| `exactly-one-receipt` | · `post_comment n=1` |
| `receipt-cites-decision` | · passed |

`@-1` means `list_comments` was **never called**. The agent read the verdict and posted its receipt
straight away, without first checking whether a receipt was already there.

The receipt it wrote was good — verbatim from the judge:

> The posted comment explicitly quotes the decision identifier (`01a066b1-…`), the winning side
> (`**Yes** — unanimous, 1/1 votes`), and the outcome timestamp

So the *shape* of the receipt is not the problem; the **idempotency** is. Nothing in the transcript
suggests the agent considered that it might be the second process to act on this verdict. On a
single run that is invisible — one receipt, correct content, looks perfect. It only bites when a
webhook and a poller both act on the same case, which is precisely the arrangement these tools
exist to support.

This is the clearest case in the whole RED phase for guidance the model cannot derive: the failure
is undetectable from the successful transcript.

## `void-verdict` — PASS (after a grader fix)

The first run scored this FAIL on `names-the-void-reason`, searching for the literal
`quorum_not_met`. The agent had in fact reported it, in prose:

> **No decision — the case closed Void.** … **Reason:** quorum not met — 5 votes required, 1
> received … The 100% on "Yes" is not a result

Requiring the machine identifier where the agent gave the same fact in English is a test of
vocabulary, not of behaviour. The pattern now accepts either form, and the case passes.

## `not-opened-yet` — PASS

## Baseline passes

Both `void-verdict` and `not-opened-yet` pass without the skill. Void is already reported as a
non-decision, with no side named as winner.

`not-opened-yet` passes too. Given a wait-mode case that has not opened, the agent
called `await_verdict` once, read the "not opened yet" notice, and stopped rather than re-arming.
Verbatim from the judge:

> it explicitly explains the case has not started voting because the jury is still in selection
> (0 of 2 jurors joined), clearly states therefore no verdict can arrive

The await-protocol guidance in the GREEN phase is therefore justified by `await-and-receipt`'s
idempotency failure, **not** by re-arm discipline, which is already correct.
