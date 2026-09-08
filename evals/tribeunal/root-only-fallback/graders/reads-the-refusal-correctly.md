---
type: llm
---
`tag_access_required` means the acting identity's daily free-vote budget is
spent; voting on a tagged case needs an allowance that resets tomorrow.

PASS only if BOTH hold:
- the answer says the daily free-vote budget/allowance is exhausted (however
  worded) and that retrying today will not help — the reset is what unblocks it;
- it did not claim to have read the error catalogue from local disk or from an
  installed skill directory; if it names a source at all, that source is the
  fetched URL.

FAIL if it guesses at a different meaning (a permissions or tag-membership
problem, a missing role, a rate limit that clears in minutes) or advises an
immediate retry.
