# Notes: projected-markdown-checks

## Suppliers

- **The selection and write-back** — `storage-projection`, whose specification sits on `plan/storage-projection`
  (`spec-storage-projection.md`). The selection's shape in § 1.4 of `spec-projected-markdown-checks.md`, `--changed`
  and its mark rules included, was agreed with that work unit's session on 2026-10-17. Its forward amendment fixes the
  command's name and lands in its pre-activation verification, once `seam-locus` and `storage-ref-backend` ship; the
  `selection` mode takes that name. Its § 7.2 sets the write check's inputs at write-back, and its base stamp and
  notice lines sit in the projected file, never in the stored content.
- **The ref backend** — `storage-ref-backend`, whose specification sits on `feat/storage-ref-backend`
  (`spec-storage-ref-backend.md`). Its write and batch paths refuse a breaking write with `record-malformed`; its merge
  after fetch reports a `rule-broken` notice and never gates ("Checks report; they never gate a merge"). It also keys a
  companion whose file is not `<key>-<slug>.md` by its path.
- **The flip** — `storage-cutover` rewrites the ceremony steps whose commits carried only state, the relocatability
  rule, and the flip's notice. The movable set, the `arc check increment` requests its rewrite keeps, and the notice
  were handed to it at draft close (`USER-INBOX § Work Unit`).

## Neighbors

- `knowledge-lint` (planned) plans to absorb `lint:arc:links` and `validate-links.sh` into its cross-reference and
  relocatability families; ARC's link rules here are the minimal form it absorbs.
- `adopter-markdown-contract` (provisional) defines what ARC requires of a project's Markdown linter and keeps the text
  ARC writes clean under common defaults.
- `operational-state-docs` owns record conformance.
- The `USER-INBOX § Errand` capture "Merge aligned Markdown tables without clashing on column padding" removes the
  table-merge clash the specification accepts for on-demand fixing.

---
