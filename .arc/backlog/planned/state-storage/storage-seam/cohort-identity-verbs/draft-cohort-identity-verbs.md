# Draft: cohort-identity-verbs

**Purpose:** Provide UID-addressed rename and coherent cohort rename, close, and removal commands required by the
store-only lifecycle.

- **Origin:** [internal] — inbox routing, 2026-10-19; original capture provenance is retained below.
- **Planning posture:** planned; `P1`; `Heavy`. This capture draft carries unresolved design input; no approved design
  is implied.

---

## Concerns

### Serve the ref backend's clash remedy: rename by UID in `arc rename`, and a cohort rename command

- _Placement:_ provisionally a seventh `storage-seam` member (`Cohort: state-storage/storage-seam`), beside the store
  arms lifecycle's verbs took. Minting it amends `cohort-storage-seam.md` forward: its "Six members" section and
  "`storage-cutover` depends on all six".

- _Observation:_ The ref backend refuses `ambiguous-match` where two live owners hold one slug — a create across work
  items and cohorts, or a clash between machines (D14) — naming the remedy "rename one by its UID"
  (`spec-storage-ref-backend.md` § 5.1 step 2, § 8). The store classes the refusal recoverable (`LocalRefusalSchema`,
  `lib/store/refusal.ts`), and `storage-ref-backend` builds the store side: a rename of the chosen owner by UID, tested
  against a live-slug clash. No command reaches it. `arc rename <slug> <new-slug>` (`cli.ts`) takes its subject by slug
  (`readStoreRenameSubject` calls `readWorkUnit`, `lib/store/lifecycle-rename.ts`), so it cannot pick either holder, and
  no command renames a cohort. `storage-ref-backend` confirmed both are outside its branch (2026-10-16): the backend
  capability alone does not make the remedy available, and it asked for them captured together for the lifecycle command
  layer, with the dependency surfaced to the cutover. `seam-lifecycle`, which owned `arc rename`, has shipped.

- _Approach:_ Let `arc rename` take its subject by UID, and its `ambiguous-match` remedy name the command with each
  candidate's UID; add a cohort rename that rewrites members' `Cohort` paths and subcohorts' `Parent` without
  re-parenting. Both run from the flip and refuse `unsupported` before it, as lifecycle's flip-only verbs do. Open
  design: what a cohort rename may write on a started member's meta under D13, as `spec-seam-decomposition.md` § 9.3 met
  for `Cohort` moves. Status reports a clash from the flip with a `slug-clash` warning naming each holder's UID and the
  rename as its repair, with no command (`spec-seam-status-roadmap.md` § 2.1, § 10); once the rename by UID lands, that
  warning names the command too.

- _Dependencies:_ `Depends On: storage-ref-backend`, whose UID rename and clash fixture the commands build on; and
  `storage-cutover` gains `Depends On` on the new work unit, since from the flip hand edits no longer rename a cohort
  and the refusal would otherwise leave no remedy a command serves (`DEV-RULES.PROJECT`, "Recovery-complete refusals").
  Commitment, priority, and `Class` are the drain's.

- _Captured during:_ `seam-decomposition` create-spec, 2026-10-16 — its § 10 accepts a doubled cut whose names clash,
  with no clean-up through a command until these land.

### Let a cohort whose last open member was abandoned close, or its document be removed

- _Observation:_ Only archive closes a cohort, and only while archiving one of its members: `prepareObservedCohorts`
  (`lib/work-unit/verbs/archive-store.ts`) completes a cohort with no open subcohort whose members, descendants
  included, are all completed (`isArchivalTriggeredWithDescendants`, `lib/work-unit/lifecycle-membership.ts`, which also
  needs at least one). Neither abandon arm (`abandon.ts`, `abandon-store.ts`) touches a cohort, no verb removes a cohort
  document, and write-back removes nothing (`storage-projection` § 7.2–7.3). So a cohort whose last open member is
  abandoned rather than archived stays open with nothing left to archive, as does one never given a member, and an open
  subcohort among them keeps its parent from closing.

- _Approach:_ Decide which verb closes or removes an open cohort with no open member, whether abandonment triggers it as
  archive does, and where it lives from the flip. It joins the rename-by-UID capture above in one work unit: cohort
  lifecycle commands the flip needs, since until then a cohort is renamed or removed by editing tracked files, and from
  it write-back removes nothing.

- _Captured during:_ `seam-decomposition` create-spec, adversarial pass 3's fix check, 2026-10-16. Its § 10 leaves such
  documents after two unsynced clones each store a cut, but any cohort can empty out through abandonment.

## Sequencing and boundaries

This planned work unit is a cutover prerequisite and an added member of `state-storage/storage-seam`. It builds on
`storage-ref-backend`’s UID rename and clash fixtures. Coordinate changes to shared lifecycle, cohort membership, and
status-remedy files with the current seam writers; implementation waits until overlapping writers have landed.

Keep structural cohort retirement distinct from `cohort-design-records`’ semantic achievement and approval forms. These
commands use the current cohort identity and membership contract; they do not wait for that broader design taxonomy.
Started-member write authority under D13 remains a planning question.

---
