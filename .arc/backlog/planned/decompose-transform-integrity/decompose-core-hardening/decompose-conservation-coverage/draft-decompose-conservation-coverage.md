# Draft: Align Decomposition Conservation with Retirement

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit`, housekeep drain (2026-07-30); captured during the
  `chunked-delivery` cohort cut.
- **Purpose:** Ensure decomposition proves preservation over every origin artifact whose content retirement would
  remove, so a successful conservation verdict cannot silently exclude a companion file.

---

## Problem / Motivation

The shipped transform inventories and proves conservation over the configured design artifact, then retires the
whole origin artifact group. A `notes-*` companion is outside `planningProfile.sourceDesign`, so it is neither
inventoried nor allocatable, while the retirement delta still plans its deletion.

The first real instance carried assurance and seam-algebra content in a notes companion. The cut assigned that
content to a member, but an unmodified transform would have deleted it while reporting complete conservation.
History makes recovery possible, yet no diagnostic says recovery is needed.

## Alternatives

- **Refuse on uninventoried retirement content:** the cheapest safe default. Any nonempty origin artifact outside
  the conservation inventory blocks the transform until the author disposes of it explicitly.
- **Inventory companion content:** extend allocation and conservation to supported companion families. This gives
  the fullest authoring path but must define how non-design documents become addressable source units.
- **Explicit disposal record:** let the author attest a disposition for content outside the design inventory and
  carry that decision in the receipt. This is flexible but adds a new authority surface.

## Direction to Settle

Start from the invariant that retirement may delete no content the proof neither preserved nor explicitly
disposed. Prefer refusal as the fail-safe baseline, then decide whether notes companions warrant first-class
allocation. Keep the current manual workaround—folding companion content into the design artifact—as migration
evidence, not the permanent contract.

## Scope Estimate

Medium — artifact-group inventory policy, refusal or allocation mechanics, receipt evidence, and real-cut
coverage.
