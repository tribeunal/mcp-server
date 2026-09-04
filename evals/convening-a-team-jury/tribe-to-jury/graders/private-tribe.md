---
type: llm
criteria: "The group whose members are invited onto the jury is private / invite-only. Tribeunal reports a tribe's privacy as the integer field `type`: 1 is public, 2 is PRIVATE — treat `type: 2` as conclusive proof of privacy. It counts either way: the agent created a tribe with isPublic false, OR it identified an existing private tribe of the user's (type 2) and reused it rather than making a duplicate. A public tribe (type 1), or no group at all, is a FAIL."
---
Two rewrites, both because the grader asked the judge for something it could
not do.

First it was `tool_used create_tribe` with `isPublic: false`, which failed the
transcript that behaved BETTER — the agent found the user's existing private
tribe and reused it, so `create_tribe` was never called.

Then, as an llm criterion, the judge failed a correct answer because it could
not confirm what `type: 2` means: "no `isPublic` field or other documented proof
that this field indicates private". The agent cited the right field and was
marked wrong for the judge's missing legend. The criterion now carries it.
