---
type: llm
---
`tag_access_required` is compound: the case is tag-gated AND the acting
identity's daily free votes are spent. The catalogue's retry answer is
"Never today. The budget resets daily."

PASS only if BOTH hold:
- the answer conveys the spent-allowance half — that the daily free-vote budget
  is exhausted (however worded) and that retrying today cannot help, because the
  daily reset is what unblocks it;
- it did not claim to have read the error catalogue from local disk or from an
  installed skill directory; if it names a source at all, that source is the
  fetched URL.

Mentioning the tag gate is CORRECT and must not be penalised — it is half the
real meaning. What fails is an answer that offers a gate, a missing role or a
membership problem *instead of* the exhausted daily budget, or one that treats
this as transient and advises an immediate retry.
