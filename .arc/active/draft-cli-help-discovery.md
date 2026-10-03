# Draft: CLI Help Discovery

- **Origin:** [internal] — minted at the 2026-09-30 housekeep drain from a `USER-INBOX` capture made during the
  `clarify-review-json-output` Errand (2026-09-23).
- **Purpose:** Make `arc --help` and the high-traffic namespaces scannable, so a person or agent can find the common
  path without reading every command.
- **Planning posture:** `P3`; `Class` settles at planning.

---

## Problem / Motivation

`npx arc --help` is 115 lines: a flat command list, long wrapped descriptions, and no examples or task groups. Busy
namespaces such as `review` are also flat, so common paths are hard to pick out. The
[CLI Guidelines](https://clig.dev/#help) recommend leading with common commands and examples, and Commander 15
supports command groups and short summaries.

## Approach

Identify ARC's priority user journeys, then make root and high-traffic namespace help scannable with concise
summaries, task-based groups, and a few useful examples. Preserve exact command syntax while improving presentation;
assess any command re-nesting as a separate interface change.

## Related

- `cli-output-contract` — grouping the output-mode families in `--help` (the way `git help -a` and `gh` do) is one of
  its smaller wins, so the two should agree on help grouping.
