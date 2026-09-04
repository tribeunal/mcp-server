# Baseline — `wiring-webhooks`

Control arm (`--arm without`), 2026-09-03, dev stack, eval identity `kuhn.kaylie`.

## `secret-first` — FAIL

Prompt: a billing service must hear when a case closes so it can release an escrow, plus start the
disputed-refund case.

| Grader | Control | With skill |
| --- | --- | --- |
| `endpoint-before-case` | ✗ `create_webhook@3 before create_case@2` | · `create_webhook@3 before create_case@8` |
| `surfaces-the-secret` · `warns-shown-once` | · passed | · passed |

The order inverts. Without the skill the agent creates the **case first** and registers the endpoint
afterwards; with it, the endpoint comes first. Everything fired between the two is lost to a
receiver that was not yet listening, and the signing secret needed to verify anything is returned
only in the create response.

The agent understood the secret was shown once in both arms. It was the *ordering consequence* that
did not follow from that, which is exactly what a procedure encodes and a tool description cannot.

## Baseline passes

| Case | Control verdict |
| --- | --- |
| `verify-signature` | PASS — computed the digest with Bash and got both verdicts right |
| `no-rotate-tool` | PASS — named the absence of a rotate tool and offered real alternatives |

`verify-signature` computed HMACs unaided (`Bash n=7`) and correctly called the first delivery
genuine and the tampered second one not. The skill's contribution there is the bundled script and
the three details that make a verifier correct, not the arithmetic.

## The prompt defect this exposed

`secret-first` failed in *both* arms at first, with `create_webhook@-1` — never called. The agent had
no endpoint URL and refused to invent one:

> I've got what I need except one thing I can't invent: **the billing service's webhook URL.**
> … it has to be absolute `https` and p[ublic]

That refusal is correct. A guessed webhook URL sends someone else's case events to an address the
requester never chose, and no amount of skill guidance should make an agent fill that in. The prompt
was missing a fact a real user would have supplied, so it now names the endpoint.

Worth contrasting with `arbitrating-a-dispute/arbitration-create`, where blocking *was* the wrong
call: there the brief was thin but sufficient and the agent could have filed while naming its gaps.
The difference is whether the missing datum is inferable. A remedy can be proposed; a URL cannot.

## Live verification

`scripts/verify-signature.js` was run against a real dev delivery — `ping`, captured from a receiver
inside the app container:

| Input | Result |
| --- | --- |
| The delivery as received | `VALID`, exit 0 |
| One byte changed in the body | `INVALID`, exit 1, "does not match the body" |
| Valid digest, stale timestamp | `INVALID`, exit 1, "60s old — possible replay" |
| Wrong secret | `INVALID`, exit 1 |

The first version of the script crashed on every input: this repo declares `"type": "module"`, so a
`.js` file is ESM and its `require` calls threw. A crash exits non-zero, which is indistinguishable
from "signature rejected" — so the tampered and replay checks *appeared* to pass while the genuine
one silently failed too. It now loads its dependencies with dynamic import inside an async wrapper,
which works whether Node treats the file as ESM or CommonJS.
