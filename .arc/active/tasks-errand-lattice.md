# Task List: Errand Lattice

- **Design:** `spec-errand-lattice.md`

---

## **Phase 1:** Character gate re-base — authoritative model + ADR-027

_Purpose:_ Land the spec-worthiness errand-vs-WU gate in its authoritative homes and capture the decision in
ADR-027, so every later phase cascades from a settled model rather than the spec alone. Pure documentation;
framework edits go through the package source then sync to `.arc/`.

_Design decisions:_ Authoritative-model-first — the vocabulary is settled before the operational surfaces
(Phase 6) consume it. ADR-027 is written here; the `Proposed → Accepted` flip is a completion-time action at
this WU's integration (the integrate ceremony does not auto-advance ADR status).

### `[x]` **1.1 Re-base boundary test #1 in `classify-work-unit` onto the two-axis spec-worthiness floor**

- _Goal:_ The method's first boundary test admits a self-evident multi-increment single-concern sweep as an
  errand and decides the wrapper floor on the two intrinsic `Class` axes (derivation + scale), not increment-count.
- **Strategies:** strategy-work-organization.md, strategy-package-project-sync.md
- _Outcome:_ Rewrote test #1 from the increment-count question onto the two-axis spec-worthiness floor (below
  _both_ axes → errand, atomic or multi-increment; clears _either_ → WU), framing the errand as the shared
  sub-floor of the same derivation/scale spectrum tests #2–#3 read. Dropped the `chore/<slug>` + PR branch aside
  (the mode-scaled branch mechanism is owned downstream); ratchet text untouched.

### `[x]` **1.2 Re-base `strategy-work-organization` §§ Class Model / Work Character / Errand Work Class / Auto-Merge Lane**

- _Goal:_ The authoritative work-organization homes describe the spec-worthiness gate, the two-layer
  mode-scaled mechanism, and the cut→occupy invariant — no section still states the increment-count floor.
- **Strategies:** strategy-work-organization.md, strategy-package-project-sync.md

    - `[x]` **1.2.a § Class Model — re-base boundary test #1 onto the two-axis floor**
        - Re-based boundary test #1 and the § framing (`Errand-vs-WU wrapper line`) onto spec-worthiness — below
          both floors → Errand (atomic or multi-increment), clears either → WU; added the wrapper-floor
          worked-example pair splitting on the scale axis (self-evident sweep → Errand; widely-used-symbol rename
          → heavy-by-scale WU).

    - `[x]` **1.2.b § Work Character — restate errand / atomic / WU on spec-worthiness**
        - Decoupled character (lowercase `atomic` / `multi-step`) from the wrapper floor; named the
          multi-increment single-concern Errand; reframed capture routing as by-fate (Errand vs WU), not
          by-character.

    - `[x]` **1.2.c § Errand Work Class — the gate, the mode-scaled mechanism, and the cut→occupy invariant**
        - Re-based the Errand definition and decision-matrix promotion criteria onto spec-worthiness (scale /
          derivation floors, not increment-count); added the two-layer model (character universal / mechanism
          mode-scaled) and the cut→occupy consumer invariant.

    - `[x]` **1.2.d § Auto-Merge Lane — durable-vs-movable as the orthogonal review-lane axis**
        - Added the blast-radius axis as orthogonal to the Errand-vs-WU wrapper — applies to errands and WUs
          alike; the spec-worthiness gate no longer carries review eligibility.

- _Outcome:_ All four §§ re-based off the increment-count wrapper floor onto the two-axis spec-worthiness gate, in
  lockstep across the package source and the `.arc/` copy; grep confirms no residual increment-count floor,
  `chore/<slug>` wrapper aside, or `## Atomic` framing remains in the file. Branch-prefix decoupling and
  record-owned identity stay with their later phases.

### `[x]` **1.3 Update `AGENT-BRIEF.ARC` vocabulary and `DEV-RULES.ARC` § Discovered Work Routing; sweep `issue-triage`**

- _Goal:_ The orientation and routing surfaces describe the lowercase-atomic / Errand-wrapper vocabulary and the
  spec-worthiness routing, with no residual increment-count basis.
- **Strategies:** strategy-package-project-sync.md

    - `[x]` **1.3.a `AGENT-BRIEF.ARC` — the Errand / atomic / Work-unit vocabulary entries**
        - Added an `Errand` vocabulary entry (off-WU wrapper, below the spec-worthiness floor, atomic _or_
          multi-increment); re-based `Atomic` → lowercase `atomic` (one-increment character, decoupled from the
          wrapper; inboxes route by fate); added a `spec-worthy` qualifier to `Work unit`. Kept hot-path-tight.

    - `[x]` **1.3.b `DEV-RULES.ARC` § Discovered Work Routing — routing table + wrapper floor**
        - Re-based the express-lanes wording onto spec-worthiness (errand = self-evident, atomic or
          multi-increment; stub = spec-worthy future work). Trimmed the capture-drain sentence — dropped the
          housekeep disposition detail (Phase-6 shared-inbox model), the "not at integration" contrast, and the
          wrong `provisional` default — leaving it at the "drains to a home" altitude. Routing table and
          Holding ≠ execution unchanged (table delegates classification to the re-based § Errand Work Class).

    - `[x]` **1.3.c `issue-triage` — sweep for any wrapper-floor / increment-count assumption**
        - Confirm-clean — no edit. Triages by severity only and delegates all routing to `DEV-RULES.ARC`
          § Discovered Work Routing, so it carries no wrapper-floor basis to correct.

- _Outcome:_ The two session-loaded orientation surfaces now carry the Errand-wrapper / lowercase-atomic vocabulary
  and spec-worthiness routing; package source and `.arc/` synced byte-identical, residual-basis grep clean. Edits
  kept minimal-viable for the hot path (these load every session).

### `[x]` **1.4 Mint ADR-027 and add the ADR-021 forward-pointer amendment**

- _Goal:_ ADR-027 records the refined model — the spec-worthiness wrapper floor, the two-layer mode-scaled
  mechanism, and record-owned identity — referencing ADR-021; ADR-021 gains a forward-pointer amendment.
- _Note:_ ADRs are project-only (`.arc/reference/adr/`, not package source). The `Proposed → Accepted` flip is
  done at integration, not here.
- **Strategies:** strategy-adr-methodology.md

    - `[x]` **1.4.a Author ADR-027 (Context references ADR-021)**
        - Wrote `adr-027-refine-errand-model.md` (Status `Proposed`). Context cites ADR-021 and the two faults;
          Decision states the three refinements (spec-worthiness floor / two-layer mode-scaled mechanism /
          record-owned identity); Alternatives carries the new-over-amend rationale and the rejected
          record-location, ref-type, and namespace options.

    - `[x]` **1.4.b Add the ADR-021 Tier-2 forward-pointer amendment pointing to ADR-027**
        - Appended a dated `**Amendment (2026-06-19):**` annotation to ADR-021 (append-only Tier-2 — taxonomy
          unchanged, not superseded) pointing to ADR-027, plus the `[adr-027]` link def.

## **Phase 2:** The errand record substrate

_Purpose:_ Build the records-only orphan state-ref `refs/arc/user/{identity}/errands` — per-slug blob
read/write, the union/reject tree-merge, and the sync extension onto the existing user-state machinery. This is
the foundation the verb surface (Phase 3) and the probe migration (Phase 4) consume.

_Design decisions:_ An orphan state-ref holding a tree of per-slug blobs (not commit-attached notes);
records-only (no working-tree `errands/` directory); rides the existing paired-push + partial-push-marker path
as a second leg. The git plumbing (`read-tree` / `write-tree` vs. a library) is implementation latitude; the
merge algorithm and its observable semantics are settled in the spec.

### `[ ]` **2.1 Define the errand record model and the orphan state-ref read/write primitives**

- _Goal:_ A typed errand record round-trips through a per-slug blob in `refs/arc/user/{identity}/errands`, read
  and written without materializing any working-tree file.
- _Approach:_ Mirror the user-notes-ref reader shape (`lib/user-sync/notes-ref.ts`) over the injectable git exec
  seam (`lib/git/exec.ts`); the blob is JSON consistent with the existing `.sync-state.json` record shape and
  carries `{slug, intent/origin, launch metadata, originating-inbox-entry pointer when present}`, uniform
  whether inbox-originated or free-description.
- _Shape:_ Expose four primitives consumed downstream — `readErrandRecord(slug)`, `writeErrandRecord(record)`,
  `removeErrandRecord(slug)`, `listErrandRecords()`. `removeErrandRecord` is deliberately separable: `close`
  (Phase 3) reaps the branch around it, while promotion (Task 6.1) removes the record while _keeping_ the
  renamed branch.
- **Strategies:** strategy-testing-methodology.md, strategy-storage-evolution.md

    - `[ ]` **2.1.a The errand record type + (de)serialization**

        Build `test-first` (one behavior at a time):

        - a record serializes and deserializes round-trip with no field loss
        - the origin field is present uniformly (inbox-originated _and_ free-description records)

    - `[ ]` **2.1.b The orphan-ref per-slug tree read/write primitives**

        Build `test-first` (one behavior at a time):

        - write a record keyed by `<slug>` into the ref's tree, then read it back by slug
        - an absent slug reads back as null
        - `removeErrandRecord` deletes one slug's blob and leaves the rest of the tree intact
        - `listErrandRecords` returns every slug present in the tree
        - no `.arc/user/{identity}/errands/` working-tree directory is created (records-only)

### `[ ]` **2.2 Implement the per-slug tree-merge (distinct-slug union / same-slug reject under non-fast-forward)**

- _Goal:_ On push/sync the ref fetches the remote, merges the per-slug tree, writes the merged tree as a new
  commit, and retries-with-refetch on non-fast-forward.
- _Rationale:_ An orphan state-ref does not inherit `git notes merge`'s built-in union, so ARC realizes the
  union/reject explicitly — distinct slugs union in; a same-slug entry must be byte-identical (idempotent) else
  surface a collision.
- _Note:_ The git plumbing (`read-tree` / `write-tree` vs. a library) is implementation latitude; only the
  observable union/reject semantics are fixed.
- **Strategies:** strategy-testing-methodology.md, strategy-storage-evolution.md

    Build `test-first` (one behavior at a time):

    - a first write against an absent remote ref creates it (no merge needed)
    - two distinct slugs created on different sides union into one merged tree
    - the same slug, byte-identical on both sides, merges idempotently (no conflict)
    - the same slug with divergent content surfaces a same-slug collision (reject)
    - a non-fast-forward push refetches, re-merges, and retries

### `[ ]` **2.3 Extend the user-state sync machinery to carry the errand ref as a second leg**

- _Goal:_ The errand ref rides the existing paired-push + partial-push-marker path — pushed immediately at
  `open`, removal pushed at `close`, reconciled periodically by `arc sync` — so a sibling clone sees the record
  within the same window as the pushed branch.
- _Approach:_ Extend `runPairedPush` (`commands/user/paired-push.ts`) and `handleUserSync`
  (`handlers/user-sync.ts`) to push the errand ref as an added leg, reusing the partial-push-marker shape
  (`recordPartialPushMarker` / `clearPartialPushMarker`, `sync-state.ts`). Routing through the existing
  machinery is the design guard that lets `cross-machine-sync-coherence`'s eventual remote-marker mechanism
  cover the ref with zero rework.
- **Strategies:** strategy-testing-methodology.md, strategy-storage-evolution.md

    Build `test-first` (one behavior at a time):

    - a paired push pushes the worktree, the notes ref, and the errand ref
    - an errand-ref push failure after worktree success records a partial-push marker (mirrors the notes leg)
    - an unavailable remote degrades gracefully without corrupting local state (mirrors the notes leg)
    - `arc sync` reconciles the errand ref (fetch + tree-merge + push)

## **Phase 3:** The `arc errand open` / `close` verb surface

_Purpose:_ Build the thin CLI surface — `open` (mint record + cut branch + occupy) and `close` (remove record +
reap branch + drop the slug-matched inbox entry) — honoring the cut→occupy contract in code. Scoped smaller than
the WU verbs: no `(phase, location)`, no relocation, no `active/` artifact.

_Design decisions:_ These are full-protection verbs — a partial-protection errand is a direct base commit with
no branch and no record, so it never invokes `open` / `close`. `open` composes the shipped `cutErrandBranch` +
the Phase 2 record-mint + occupy; `close` composes `removeErrandRecord` + branch/worktree reap + the shipped
`removeInboxEntry`. The inbox entry drops at completion (never at start), so an abandoned errand never orphans
the intent. Occupy default is the in-place switch until `finalize-parallelism` ships.

### `[ ]` **3.1 `arc errand open <slug>` — mint the record, cut a nature-typed branch, occupy per protection mode**

- _Goal:_ `arc errand open <slug>` mints the identity record, cuts a nature-typed branch (`fix/` / `refactor/` /
  `chore/`) as the record's projection, and occupies per protection mode — never leaving the session on the
  launch branch.
- _Approach:_ New subcommand in `cli.ts` (alongside `errand cut` / `errand check`) with a handler in
  `handlers/errand.ts`; compose the creation-only `cutErrandBranch` (`lib/session-init/errand-branch-cut.ts`,
  unchanged) + the Phase 2 record-mint + occupy. Occupy = in-place switch (worktree spawn deferred to
  `finalize-parallelism`).
- **Strategies:** strategy-testing-methodology.md, strategy-work-organization.md

    Build `test-first` (one behavior at a time):

    - `open <slug>` mints a record and pushes it (Phase 2 sync)
    - the branch is cut nature-typed; an existing branch is left untouched (no-clobber, via `cutErrandBranch`)
    - after the cut the session occupies the branch (in-place switch) — never left on the launch branch
    - a free-description `open` (no originating inbox entry) still produces a recoverable record

### `[ ]` **3.2 `arc errand close` — remove the record, reap the branch / worktree, drop the slug-matched inbox entry**

- _Goal:_ `arc errand close` removes the identity record, reaps the branch / ephemeral worktree and prunes the
  remote-tracking ref, and drops the slug-matched inbox entry at completion.
- _Approach:_ New subcommand + handler composing the separable `removeErrandRecord` (Phase 2) + branch/worktree
  reap + the shipped `removeInboxEntry` (`lib/user-sync/inbox-writer.ts`) for the inbox drop; the record removal
  pushes via the Phase 2 sync.
- **Strategies:** strategy-testing-methodology.md, strategy-work-organization.md

    Build `test-first` (one behavior at a time):

    - `close` removes the record and pushes the removal
    - the branch / ephemeral worktree is reaped and the remote-tracking ref pruned
    - the slug-matched inbox entry is dropped; an absent entry is an idempotent no-op
    - the inbox entry drops only at `close`, never at start (an abandoned errand keeps a recoverable record)

## **Phase 4:** Record-owned identity migration

_Purpose:_ Move errand identity off the branch parse and onto the record — migrate the session-init errand
probes to record reads, retire `errandSlugOf`, and make `fix/` / `refactor/` / `chore/` branches all resolve as
errands via the record.

_Design decisions:_ The branch becomes a projection of the record; identity moves to the record while merge
status stays a live PR/branch read. Branch-prefix decoupling is additive (`chore/` stays valid). No backfill
mechanism — the session-init probe shows zero in-flight errands, so no record-less errand is expected at ship; a
stray legacy branch degrades gracefully to branch-derived behavior.

### `[ ]` **4.1 Migrate the session-init errand probes to record reads**

- _Goal:_ The errand probes resolve identity and state from the record, not by parsing `chore/<slug>` —
  `detectErrandResume`, `classifyInFlightErrands`, `findMaterializableErrands`, and their `runErrandState`
  composition read the record.
- _Approach:_ The probes today derive identity via `errandSlugOf` over the branch and via `deriveInFlight`'s
  meta-presence classification (`lib/git/in-flight-derivation.ts`); repoint them to the Phase 2 record reader.
  Merge status (`awaiting-merge` / `merged-cleanup` / `materializable`) stays a live read — only identity moves.
- **Strategies:** strategy-testing-methodology.md

    Build `test-first` (one behavior at a time):

    - resume detection resolves the current branch's errand identity from the record (any nature-typed prefix),
      not a `chore/` parse
    - the in-flight sweep classifies record-backed errands; merge-status derivation is unchanged
    - materializable detection reads remote-only records
    - a record-less legacy `chore/<slug>` branch degrades gracefully to branch-derived behavior

### `[ ]` **4.2 Retire `errandSlugOf`'s branch-parse and decouple the branch prefix**

- _Goal:_ `errandSlugOf` is removed once no probe depends on it, and a `fix/` or `refactor/` branch resolves as
  an errand via the record — the branch prefix no longer carries errand-ness.
- _Approach:_ Remove `errandSlugOf` (`lib/session-init/errand-branch.ts`) after 4.1; update `deriveInFlight`'s
  `classifyBranch` so errand-vs-WU comes from the record, not the `chore/` prefix. `ERRAND_BRANCH_PREFIX` stays
  valid as a cut default but is no longer the discriminator.
- _Note:_ Depends on 4.1 — the probes must read records before the parse is removed.
- **Strategies:** strategy-testing-methodology.md

    Build `test-first` (one behavior at a time):

    - a `fix/<slug>` and a `refactor/<slug>` branch with a record both resolve as errands
    - `deriveInFlight` classifies errand-vs-WU from the record, not the branch prefix
    - `errandSlugOf` is gone with no caller remaining (typecheck + grep clean)

## **Phase 5:** Personal capture surface relabel

_Purpose:_ Land the gate in the personal surface — relabel the `USER-INBOX` sections to `## Errand` / `## Work
Unit` with new-model preambles, and update the coupled code in lockstep so no inbox read or the `removeInboxEntry`
write regresses. This phase is the _functional_ relabel (content + code); the prose surfaces that _describe_ the
sections (skills, strategy doc) re-base in Phase 6.

_Design decisions:_ Content and code edited together; the `WU_Target` field stays on `## Work Unit` entries and
rides the entry `raw` verbatim. A one-time content + `ENTRY_SECTIONS` edit applied with the parser / probe
updates — no migration mechanism.

### `[ ]` **5.1 Relabel the `USER-INBOX` sections and rewrite the preambles to the spec-worthiness model**

- _Goal:_ `USER-INBOX` reads `## Errand` / `## Work Unit` with preambles stating the spec-worthiness model; the
  live entries migrate under the new headings and `WU_Target` stays on `## Work Unit` entries.
- _Approach:_ Edit two surfaces — the live project instance `.arc/user/andrew/USER-INBOX.md` (migrate its
  current `## Atomic` / `## Backlog` entries) and the shipped new-adopter template
  `packages/arc-framework/templates/user/USER-INBOX.md` (seeded at `arc init` / user-setup via `lib/setup.ts`).
  The template is adopter-facing — keep its preamble neutral, no internal-roadmap framing. Leave the
  `## Removed:` tombstones' historical `_Section:_` values as-is.
- **Strategies:** strategy-session-operations.md

### `[ ]` **5.2 Update the coupled inbox-section code in lockstep, tests green**

- _Goal:_ Every place the section labels are hardcoded reads `Errand` / `Work Unit`, and the inbox
  reader / writer / probes operate on the renamed sections with their tests green.
- _Approach:_ Update `ENTRY_SECTIONS` (`lib/user-sync/inbox-writer.ts`), the parser section loop
  (`lib/user-sync/parser.ts`), the reminder section filter (`lib/session-init/inbox-reminders.ts`), and
  `inbox-state.ts` doc/usage; migrate the test fixtures' literal `## Atomic` / `## Backlog` to the new headings.
  Preserve the single-section reminder scope — the old `## Atomic`-only nudge maps to `## Errand`-only;
  `## Work Unit` is never nudged.
- **Strategies:** strategy-testing-methodology.md

    Build `test-first` (one behavior at a time):

    - `removeInboxEntry` finds and excises entries under `## Errand` and `## Work Unit`
    - the parser yields entries carrying the new `section` values; `WU_Target` rides `raw` verbatim
    - reminders surface from `## Errand` only; `## Work Unit` is never nudged
    - `runInboxState` counts routable entries across both renamed sections

## **Phase 6:** Crossing edges + operational-surface cascade

_Purpose:_ Update every operational surface a session consults during classification, capture, routing, or
execution — the crossing edges, the routing/execution workflows, and the skills — to the new model, so the WU
exits gapless (no surface still describes the increment-count floor or the durable-as-wrapper conflation).

_Design decisions:_ `init-work-unit` § Promote Errand re-bases its criterion and gains the
record-retirement-on-promotion step, reusing the Phase 2/3 machinery rather than rebuilding it. The cut→occupy
consumer audit fixes `run-errand`, `drain-inbox` § 5, and session-init's errand cold-entry to inline-conform.
Framework-doc edits go package-source-first then sync; canonical skill sources may need a hand-sync to the
harness-local copies in this self-hosting repo.

### `[ ]` **6.1 Re-base `init-work-unit` § Promote Errand and build the record-retirement-on-promotion step**

- _Goal:_ The Promote Errand path admits an errand that becomes spec-worthy (not "more than one increment"),
  works for any nature-typed branch, resolves the promoted errand's identity from the record, and retires the
  errand record on promotion.
- **Strategies:** strategy-work-organization.md, strategy-package-project-sync.md, strategy-testing-methodology.md

    - `[ ]` **6.1.a Re-base the § Promote Errand workflow prose**
        - Re-base the promotion criterion onto spec-worthiness (part 2); make the branch verify / rename
          branch-prefix-agnostic; resolve the promoted errand's identity from the record. Reuse transition-core's
          `scaffold` / cut / rename mechanics — don't rebuild them.

    - `[ ]` **6.1.b Build the record-retirement step (promotion removes the errand record)**
        - Reuse the separable `removeErrandRecord` primitive (Phase 2) — _not_ full `close`, since promotion
          renames the branch rather than reaping it. The WU meta now supersedes the record.

        Build `test-first` (one behavior at a time):

        - promoting an errand removes its identity record while the renamed branch survives

### `[ ]` **6.2 Update `run-errand` and `drain-inbox` — multi-increment + cut→occupy + routing**

- _Goal:_ `run-errand` admits a multi-increment single-concern maintenance errand (gated in chunks, one PR) with
  record-owned identity at `open` / `close`, and `drain-inbox` § 5 inlines the "then occupy" clause and routes
  character-aware.
- **Strategies:** strategy-work-organization.md, strategy-package-project-sync.md

    - `[ ]` **6.2.a `run-errand` — admit the multi-increment errand; wire the `open` / `close` record lifecycle**
        - Relax the "one review increment" framing to admit the multi-increment shape; keep cut→occupy inline
          (already honored at § Launch).

    - `[ ]` **6.2.b `drain-inbox` § 5 — inline cut→occupy conformance; character-aware routing**
        - Inline the "then occupy" clause (the known under-spec: a linear reader currently cuts and writes
          without leaving the launch branch); route multi-step errand-class work to execute / personal-hold,
          never a stub.

### `[ ]` **6.3 Reframe the capture/drain skills + inbox-describing docs; audit session-init cut→occupy**

- _Goal:_ The capture/drain skills and the inbox-describing docs key on the spec-worthiness question and the
  reframed infra-smell advisory, and session-init's errand cold-entry inline-conforms to cut→occupy.
- _Context:_ The single capture gate is _"does this need a spec — anything worth recording as
  design/requirements — or is it self-evident?"_ The infra-smell advisory reframes to "needs the reviewed lane,
  and _check_ whether design is hiding here" — not "promote to a stub."
- **Strategies:** strategy-work-organization.md, strategy-package-project-sync.md

    - `[ ]` **6.3.a `arc-inbox` skill — spec-worthiness classification + the `## Errand` / `## Work Unit` labels**
        - Capture classification keys on spec-worthiness / fate; lowercase `atomic`; the infra-smell reframe;
          update the section-label references to the renamed sections.

    - `[ ]` **6.3.b `arc-housekeep` skill — character-aware drain routing**
        - Multi-step errand-class → execute / personal-hold, never a stub.

    - `[ ]` **6.3.c `strategy-session-operations` § USER-INBOX — relabel the section descriptions**
        - This surface still names `## Atomic` / `## Backlog`; relabeling it holds the exit-gapless standard
          (no surface describes the old sections).

    - `[ ]` **6.3.d Audit session-init's errand cold-entry for cut→occupy inline conformance**
        - Confirm the errand cold-entry path inlines the "then occupy" clause (no consumer cuts without
          immediately occupying).

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` The errand-vs-WU gate is defined on spec-worthiness (the two-axis floor) in `classify-work-unit` and
  `strategy-work-organization` § Class Model; no surface in the cascade still describes the increment-count
  wrapper floor or the durable-as-wrapper conflation — including the `USER-INBOX` section labels and the
  `init-work-unit` § Promote Errand criterion.
- `[ ]` A multi-increment single-concern maintenance errand runs on-script through `run-errand` (gated in chunks,
  one PR).
- `[ ]` `arc errand open <slug>` mints the identity record, cuts a nature-typed branch as its projection, and
  occupies per protection mode; `arc errand close` removes the record, reaps the branch / ephemeral worktree, and
  drops the slug-matched inbox entry at completion.
- `[ ]` Errand identity resolves from the record, not a branch parse: `errandSlugOf`'s branch-parse is retired,
  the session-init errand probes read the record, and a `fix/`- or `refactor/`-prefixed branch resolves as an
  errand.
- `[ ]` The record lives at `refs/arc/user/{identity}/errands` as a records-only orphan state-ref (no
  working-tree file), synced via the existing user-state machinery; concurrent distinct-slug creation
  union-merges and a same-slug collision rejects under non-fast-forward.
- `[ ]` The crossing edges are updated: `init-work-unit` § Promote Errand re-bases its criterion onto
  spec-worthiness, is branch-prefix-agnostic, resolves identity from the record, and retires the errand record on
  promotion — reusing transition-core's mechanics, not rebuilding them.
- `[ ]` cut→occupy is codified as a consumer invariant, and `run-errand`, `drain-inbox` § 5, and session-init's
  errand cold-entry each inline-conform.
- `[ ]` The personal capture surface lands the gate: `USER-INBOX` sections relabeled `## Errand` / `## Work Unit`
  with new-model preambles; `arc-inbox` / `arc-housekeep` / `DEV-RULES` key on spec-worthiness; the coupled code
  updated in lockstep with tests green.
- `[ ]` ADR-027 is written and `Accepted` (referencing ADR-021, which gains a forward-pointer amendment).
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
