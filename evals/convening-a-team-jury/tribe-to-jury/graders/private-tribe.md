---
type: llm
criteria: "The group whose members are invited onto the jury is private / invite-only. It counts either way: the agent created a tribe with isPublic false, OR it found an existing private tribe of the user's and reused it rather than making a duplicate. A public tribe, or no group at all, is a FAIL."
---
This was a `tool_used create_case`-style check on `create_tribe` with
`isPublic: false`, and it failed a transcript that behaved better than the one
it was written for: the agent found the user's existing private tribe and
reused it, so `create_tribe` was never called. Reuse is the better move and the
constraint is that the group is private, not that a tribe was created.
