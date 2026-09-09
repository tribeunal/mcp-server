# Root skill (`tribeunal`) — RED baseline

Recorded 2026-09-08 against `main` @ `7f1c5f0`, before the root `SKILL.md` was written.
Runner: `npx tsx scripts/eval-skill.ts --skill tribeunal --arm without --runs 1`.

**Three cases, three failing controls.** Every case earns its guidance; nothing here is decoration.

> **Harness correction, same day.** The first baseline was taken while root-mode runs still had
> `Bash`. `--allowedTools` only pre-approves — it does not deny — so a control that was supposed to
> have no tools shelled out to `claude mcp list` and grepped `~/.claude.json`, reading the operator's
> real MCP config, and spent its whole turn budget investigating instead of answering. Root-mode
> cases now carry a `permissions.deny` list, and **both arms below were re-run under it**. The
> conclusions did not change; one grader moved to *Baseline passes*.

## `cold-start` — 2 of 3 graders fail

`mcp: none`. Prompt: *"I want a jury to rule on whether we rewrite or refactor our billing service.
Use Tribeunal for it."*

| Grader | Control |
| --- | --- |
| `names-the-endpoint` | FAIL — `/mcp\.tribeunal\.com/mcp/` hits=0 |
| `gives-an-install-route` | FAIL — plugin / `claude mcp add` / `skill.md` alternation hits=0 |
| `does-not-fake-a-case` | passes — see *Baseline passes* |

Verbatim (control, no tool calls):

> I don't have a Tribeunal skill available in this session […] **If Tribeunal is a skill you have
> somewhere**, it needs to be installed where this session can see it — typically as a plugin, or as
> a `SKILL.md` under `.claude/skills/tribeunal/` […] **If you want the ruling now**, I can run the
> jury myself —

Two failures with one shape. Unaided the model reasons about *Claude Code's* skill-loading mechanics —
it has no idea Tribeunal is a hosted server with an endpoint — and then offers to **simulate the
product**. The endpoint and the install routes are facts about this server that no reasoning supplies.
That is the "Getting connected" section's entire job.

## `first-response` — 2 of 3 graders fail

`mcp: none`. Prompt: *"Introduce Tribeunal now that I've installed the skill."*

| Grader | Control |
| --- | --- |
| `uses-the-opening-line` | FAIL — `/Tribeunal is installed\./` hits=0 |
| `stays-an-introduction` | FAIL — judge: "declines to provide an introduction rather than introducing the product"; a later rep ran to "~190 words with the diagnostic explanation" |
| `names-no-tools` | passes — see *Baseline passes* |

Verbatim:

> I don't have a Tribeunal skill available — it isn't in the list of skills loaded in this session […]
> - **Installed but not picked up yet** — skills are read at session start.
> - **Wrong location** — project skills go in `.claude/skills/<name>/SKILL.md` …

Asked to introduce a product, the control writes an install-debugging checklist. The fixed opening
line and the ≤80-word block are what make every harness introduce Tribeunal the same way.

## `root-only-fallback` — 2 of 2 graders fail

MCP connected, `allowed_tools: [WebFetch]`, only the root file installed. Prompt: *"Tribeunal just
refused my vote with `tag_access_required`. What does that mean and should I retry?"*

| Grader | Control |
| --- | --- |
| `fetches-the-error-catalogue` | FAIL — `WebFetch` n=0, want ≥1 |
| `reads-the-refusal-correctly` | FAIL — judge: "guesses at tag-membership, jury-seating, and arbitration barriers as the 'plausible readings'" |

Verbatim:

> I also can't tell you authoritatively what that tag means, because `tag_access_required` isn't
> documented in any of the Tribeunal tool descriptions I have loaded in this session.
> […] **The name points at eligibility, not at your** …

The control correctly refuses to invent — and then infers anyway, landing on the wrong half. The
truth is compound: the case is tag-gated **and** the identity's daily free votes are spent, so the
retry answer is *never today* (`skills/using-tribeunal/references/errors.md:19`). Knowing the
catalogue exists at a fetchable URL, and that guessing is not allowed, is the whole lesson.

### Measured install behaviour

The root skill and the README both claim that `npx skills add tribeunal/mcp-server` installs the
entry skill alone and `--full-depth` installs all nine. That reads backwards against the upstream
CLI's "outside these container directories" wording, and a reviewer inferred from those docs that it
must be inverted. It is not. Measured on this repository, skills CLI 1.5.24:

```
$ npx -y skills@latest add <repo> --list
◇  Found 1 skill
│    tribeunal

$ npx -y skills@latest add <repo> --list --full-depth
◇  Found 9 skills
│    tribeunal, acting-on-verdicts, arbitrating-a-dispute, convening-a-team-jury,
│    deciding-with-a-jury, serving-jury-duty, using-tribeunal, weighing-evidence,
│    wiring-webhooks
```

A root `SKILL.md` shadows the nested ones by default; `--full-depth` lifts the shadow. Re-run both
commands before changing that sentence — the docs do not describe this interaction, so reasoning
from them produces the wrong answer.

### Baseline passes

Kept as regression guards only. Neither earns guidance of its own, per `superpowers:writing-skills`.

- `cold-start` / `does-not-fake-a-case` — with no tools, the control had nothing to fake a case
  *with*, so it never claimed one. The guard matters in the `with` arm, where the skill describes a
  product the agent still cannot reach.
- `first-response` / `names-no-tools` — likewise: no tools loaded, so no `tribeunal_` name to emit.
  The guard matters once the routing table is in scope.

Every case retains at least one grader the control genuinely fails.

## What the GREEN arm needed

Two rounds, both recorded because each was a real defect rather than a wording preference:

1. **A contradiction in the skill.** The first draft of *First response* told the agent to "say what
   to connect" if nothing was connected — directly against the same section's ≤80-word,
   no-endpoints contract. The agent obeyed the wrong half and appended a `claude mcp add` line.
2. **A prohibition that got negotiated.** Rewriting it as "nothing else belongs in that reply" still
   lost: the agent noticed the server was unreachable and appended the command anyway, prefaced with
   "One thing to do first". It passed one rep and failed the next — variance, which
   `superpowers:writing-skills` reads as wording that is not binding. Closing the loophole by name
   ("not a remark that nothing is connected yet … noticing that the server is unreachable is not a
   reason to append it") converged it: **3 of 3 reps pass**.
