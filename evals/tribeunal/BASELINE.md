# Root skill (`tribeunal`) — RED baseline

Recorded 2026-09-08, before a single line of the root `SKILL.md` was written, against
`main` @ `7f1c5f0`. Runner: `npx tsx scripts/eval-skill.ts --skill tribeunal --arm without --runs 1`.

**Three cases, three control failures.** Every case earns its guidance; nothing here is decoration.

## `cold-start` — 3 of 3 graders fail

`mcp: none`, so the agent has no Tribeunal tools and no `Bash`. Prompt: *"I want a jury to rule on
whether we rewrite or refactor our billing service. Use Tribeunal for it."*

| Grader | Control |
| --- | --- |
| `names-the-endpoint` | FAIL — `/mcp\.tribeunal\.com/mcp/` hits=0 |
| `gives-an-install-route` | FAIL — plugin / `claude mcp add` / `skill.md` alternation hits=0 |
| `does-not-fake-a-case` | FAIL — judge: "did not explicitly tell the user what to connect before a case can be filed" |

Verbatim (control, no tool calls):

> I don't have a Tribeunal skill available in this session. The skills I can invoke are: dataviz,
> update-config, … — nothing named Tribeunal or anything jury/deliberation-shaped.
> […]
> In the meantime, I can do the underlying task directly: stage a structured multi-perspective
> deliberation on rewrite vs. refactor for your billing service — e.g. independent advocates for each
> position plus a synthesis, grounded in the actual code.

The failure has a shape worth naming: unaided, the model does not say *how to connect* — it offers to
**simulate the product instead**. The endpoint and the install routes are facts about this server that
no amount of reasoning supplies. That is precisely the "Getting connected" section's job.

*(First run used `max_turns: 4`; the agent spent every turn on `Bash` calls the allow list denied and
never produced an answer, so the judge had no text to read. Budget raised to 8 and the case re-run —
the control then answered in full and still failed all three graders. A turn-starved transcript is a
harness artefact, not a RED.)*

## `first-response` — 2 of 3 graders fail

`mcp: none`. Prompt: *"Introduce Tribeunal now that I've installed the skill."*

| Grader | Control |
| --- | --- |
| `uses-the-opening-line` | FAIL — `/Tribeunal is installed\./` hits=0 |
| `stays-an-introduction` | FAIL — judge: "a troubleshooting guide about skill installation, not a first introduction … walks the user through configuration steps and file paths, exceeds the word limit" |
| `names-no-tools` | **passes in the control** (`/tribeunal_/` hits=0) — see *Baseline passes* |

Verbatim:

> I don't have a Tribeunal skill available, so I can't introduce it — anything I said about what it
> does would be invented. […] I tried to search the filesystem for it directly, but both commands were
> declined by the permission layer.

Unaided the model turns an introduction into an install-debugging session. The fixed opening line and
the ≤80-word block are what make every harness introduce the product the same way.

## `root-only-fallback` — 2 of 2 graders fail

MCP connected, `allowed_tools: [WebFetch]`, only the root file installed. Prompt: *"Tribeunal just
refused my vote with `tag_access_required`. What does that mean and should I retry?"*

| Grader | Control |
| --- | --- |
| `fetches-the-error-catalogue` | FAIL — `WebFetch` n=0, want ≥1 |
| `reads-the-refusal-correctly` | FAIL — judge: "guessed the error means a tag-membership/credential access problem …, not an exhausted daily allowance" |

Verbatim:

> I checked: the `using-tribeunal` skill isn't installed in this session, so I can't give you
> Tribeunal's official definition of that error code — and I'd rather not invent one for a permissions
> error.
> […] **What it most likely means** (inference from the name…)

The control correctly refuses to invent — and then infers anyway, landing on the wrong half of the
answer. The truth is compound: the case is tag-gated **and** the identity's daily free votes are spent,
so the retry answer is *never today* (`skills/using-tribeunal/references/errors.md:19`). It also
called `tribeunal_jury_duty_dashboard`, saw budget remaining, and was pushed further from the answer.
Knowing the file exists at a fetchable URL — and that guessing is not allowed — is the whole lesson.

### Baseline passes

- `first-response` / `names-no-tools` — the control never emitted a `tribeunal_` tool name, because it
  had no tools to name. Kept as a **regression guard only** (the `with` arm must not start naming
  tools once the routing table is in scope); it earns no guidance of its own, per
  `superpowers:writing-skills`.

No case was dropped: every case has at least one grader that the control genuinely fails.
