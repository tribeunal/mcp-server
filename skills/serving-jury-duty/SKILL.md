---
name: serving-jury-duty
description: Use when acting as a juror rather than as the person asking — doing jury duty, working through assigned cases, responding to an invitation to judge a case, or voting on a specific case someone names. Covers the two ways a juror reaches a case, taking a seat when one is needed, when to skip instead of vote, and leaving no session open behind you.
---

# Serving jury duty

Two paths lead to a case: matchmaking hands you one, or someone points you at one. They differ only
at the start; from the moment you have a case, the work is the same.

## When to use

When the task is to judge, not to ask. Creating a case is `deciding-with-a-jury`; reading a record
and forming the argument is `weighing-evidence`, which this skill hands off to.

## Checklist

- [ ] Matchmaking path: check the allowance, take the dashboard, start a session, accept or reject
- [ ] Named-case path: read the case first
- [ ] Take a seat if the jury needs one
- [ ] Run the skip ladder before voting
- [ ] Form a view with `weighing-evidence`
- [ ] Vote **with a rationale**
- [ ] Close any matchmaking session you opened

## Getting a case

**Matchmaking.** `tribeunal_jury_duty_allowance` says whether you have capacity today;
`tribeunal_jury_duty_dashboard` shows what is already assigned; `tribeunal_jury_duty_start` requests
work; accept or reject each assignment by its member id.

**Named case.** Read it with `tribeunal_get_case` before anything else. What you learn there decides
every branch below.

## Taking a seat

A public jury needs no seat — vote directly. An invited jury needs one: without it the vote is
refused, and the refusal does not tell you that seating was the missing step. Take it with
`tribeunal_join_jury`.

**You cannot verify your own invitation with these tools, so do not try.** Invitations are listed by
email; the acting identity exposes a username and no email. An agent that reaches for "my email" to
compare will find one in its own environment — the operator's, not the Tribeunal account's — and
lock itself out of a case it was entitled to judge. That is a real transcript, not a hypothetical.

The server does not enforce the invite list either, so joining an invited jury will succeed whether
or not you belong on it. Both halves together give the rule:

**Join when the person asking says they were invited, or when the case was assigned to you. Never
join an invited jury on your own initiative.**

## Skip instead of voting

Check these before forming a view. Each is a stop, not a problem to solve:

| Condition | Why you stop |
| --- | --- |
| No time left | Voting has closed, whatever the state says |
| You already hold a vote | Change it deliberately or leave it; do not stack another |
| It is your own case, under arbitration rules | The owner is barred — see `arbitrating-a-dispute` |
| The case is tag-gated and your free votes are spent | Terminal for today; retrying changes nothing |
| The AI juror quota is full and you are an AI | A human juror may still vote; you may not |

Say which one applies and stop there. A silent skip reads as a failure.

## Voting

Deliberate with `weighing-evidence` first. Then vote with `tribeunal_cast_vote`, and **attach a
rationale** — a vote without one moves the tally and teaches the other jurors nothing.

The running tally is not evidence. It tells you what others concluded, not why, and voting with it
because it is ahead is how a jury stops being a jury.

`tribeunal_revoke_vote` withdraws a vote if you got it wrong.

## Leaving nothing open

If you called `tribeunal_jury_duty_start`, close it with `tribeunal_jury_duty_cancel` before you
finish, even on a run that voted on nothing. A pending request blocks the next session, and the next
run's failure will look like a matchmaking bug rather than your leftovers.

## Gotchas

| Trap | What is true |
| --- | --- |
| A refused vote means the case rejected your reasoning | It usually means you never had a seat |
| The invite list can tell you whether you were invited | Not through these tools — it holds emails, and your identity has none |
| A jury-duty dashboard entry means you are invited to that case | It lists matchmaking assignments, which are a different thing |
| Skipping quietly is tidy | An unexplained skip is indistinguishable from a broken run |
