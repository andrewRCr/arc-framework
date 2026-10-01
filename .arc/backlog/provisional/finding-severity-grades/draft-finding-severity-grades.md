# Draft: Finding Severity Grades

- **Origin:** [internal] — minted at the 2026-09-30 housekeep drain from the design half of a `USER-INBOX` capture,
  "Re-examine a nitpick severity class, and accept every documented CodeRabbit CLI severity", made during the
  `coderabbit-missing-instructions` Errand (2026-09-28). The parser defect it contains — a `critical` CLI finding
  fails the whole frontline pass — stays in `USER-INBOX § Errand` as a pull-forward candidate.
- **Purpose:** Decide how ARC's finding severity model holds the finer grades providers now report, and map every
  documented provider grade onto it honestly.
- **State:** provisional stub. Concern recorded; a design lean exists but nothing is settled.

---

## Problem / Motivation

ARC grades findings `critical | major | minor`, and marks pure polish only as an optional `nit` on `minor`
(`reportedNit` / `verifiedNit`). A separate nitpick class was considered once and declined. Providers now report finer
grades than that model holds:

- Codex hosted findings carry `P0`–`P3`; `hosted/codex.ts` folds both `P2` and `P3` into `minor`.
- CodeRabbit hosted findings have an explicit nitpick section, which `hosted/coderabbit-body.ts` turns into the `nit`
  marker.
- The CodeRabbit CLI reference lists agent-mode severities `critical | major | minor | trivial | info | none`.
  CodeRabbit's own agent-event schema document (`coderabbitai/kiro-power-coderabbit`,
  `steering/agent-event-schema.md`) says "typically critical | major | minor | suggestion".

`parseFindingEvent` in `providers/coderabbit/frontline-agent.ts` accepts only `blocker | major | minor`, so one finding
at any other documented severity fails the whole frontline pass as `malformed`. All 150 stored CLI findings (0.7.2
through 0.8.1) were `major` or `minor`, and none of the documents names `blocker`.

## Current model

The marker is already a fourth tier in all but name. `FindingClassificationSchema` (`core/review-primitives.ts`)
makes `nit` legal only on `minor`, and it changes behavior, not just display: a verified nit is always record-only,
while an ordinary `minor` follows `minorGating`. It is a marker so that the three-value severity enum's consumers (16
references across about 10 files: ceilings, highest-severity reporting, disposition reports, provider mappings) read
a nit as `minor` unchanged; only gating reads the marker.

## Design lean (not settled)

Promote `nit` to a peer fourth class. It already excludes `major` and `critical`, so the class carries the same
information. Provider grades then map directly, the illegal combination disappears, and reports show the grade
honestly. The cost is a fourth value and its ordering in every severity consumer, which pre-release carries no data
migration.

## Keep distinct

The providers' lowest grades are not one kind of thing:

- pure polish (`nit`, CodeRabbit CLI `trivial`, the CodeRabbit hosted nitpick section) is a real but trivial
  improvement;
- Codex `P3` is low priority and can be a genuine small defect, closer to `minor`;
- CodeRabbit CLI `info` / `none` look like non-defects with nothing to change, and may not belong on the severity scale
  at all; they could be dropped or recorded differently at normalization.

A single catch-all would merge "trivial improvement" with "nothing wrong here".

## Unknown grades (Owner lean recorded)

A catch-all class for `info` / `none`, meaning "the provider flagged it but calls it not a defect", keeps those
findings visible instead of dropping them. Unrecognized grades should not fall through to the lowest tier, though. A
future grade is not necessarily a low one — the parser's `blocker` → `critical` mapping came from an earlier CLI
version — and a new high grade landing at the bottom would turn record-only and could pass a gate it should stop.
Treat an unknown grade as _unrated_ instead:

- keep the finding, with the provider's raw grade in its source label;
- leave ARC's source-verified triage to set the severity;
- show the gate that the grade was unrecognized.

That still stops one unexpected value from failing the whole pass, without gating on a guess. Keep the two apart:
"known non-defect" is a fact about the finding, while "unrecognized grade" is a gap in ARC's mapping.

## Sequencing

Review work runs ahead of the storage seam only as Errands that pass the `state-storage` pull-forward filter, so this
work unit waits for the program. The `critical` mapping does not.
