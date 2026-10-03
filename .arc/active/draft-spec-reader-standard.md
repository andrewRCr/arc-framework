# Draft: Spec Reader Standard

- **Origin:** [internal] — minted at the 2026-09-30 housekeep drain from a `USER-INBOX` capture, "Write specs for the
  reader who checks the change against them", made during `storage-contract` draft-design, C10 export discussion
  (2026-09-29).
- **Purpose:** Write specs for the reader who checks the change against them: the body uses the project's own
  vocabulary and cites no planning context that reader cannot reach.
- **Planning posture:** `P2`; `Class` settles at planning. Independent of the storage program — land it ahead, since
  the storage contract exports specs into pull requests by default.

---

## Problem / Motivation

Specs cite planning context a reviewer cannot reach and should not need. In the latest archive quarter, 11 of 12
sampled specs name other work units in the body, up to 32 times — scope stated as another unit's ownership, concepts
borrowed from unshipped specs, provenance — and 11 of 40 cite a draft or notes file. Neither `create-spec` nor the spec
templates invite it; it is authoring habit. The references decay as the units they name ship, rename, or retire, and
the executing session reads the spec cold. Once `storage-contract` lands, specs export into pull requests by default
under the standard profile, and none of these references resolve from the repository.

## Approach

A reader standard for specs:

- Process metadata stays in the header.
- The body uses the project's own vocabulary and cites no other work unit, register row, or planning artifact — the
  work unit's own draft and `notes-*` included.
- A scope boundary says what the change does not do, not who does it.
- A concept the spec relies on is defined in the spec or cited from shipped code or documentation.
- Coordination, provenance, and internal rationale live in the draft or `notes-*`, which the draft and task list may
  cite.
- ARC vocabulary appears in the body only as subject matter (this repository's self-hosting distinction).

Touches `create-spec`, the spec templates, and likely `DEV-RULES.ARC` § Documentation Boundaries.

## Open design

- The header carve-out's exact fields.
- Whether a check flags foreign work-unit slugs and artifact filenames in a spec body — it catches the common cases,
  never all.

## Grounding

ADRs written for "a new person coming on to a project" (Nygard); Rust RFCs' "teaching it to another Rust programmer";
Google's developer documentation style guide — define jargon on first use or link it.

## Related

- `planning-iteration-mechanics` holds the companion timing rule: coordination routing leaves the planning record at
  draft close, before `create-spec`, because a spec under this standard cites no other work unit.
- `documentation-surface-routing` owns which content belongs on which task-adjacent surface; this unit owns the spec's
  own reader contract.
