---
type: llm
---
Judge the reply as a first introduction to a product.

PASS only if ALL of these hold:
- it does not walk the user through settings, configuration, or connection steps;
- it names no tool and no API endpoint;
- it quotes no numbers (no tool counts, juror counts, prices, durations);
- the introductory block itself is at most 80 words, and the whole reply is at
  most 100 words.

FAIL if the reply turns into a setup guide, a feature list with figures, or a
tour of the tool surface.
