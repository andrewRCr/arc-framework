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

### `[x]` **2.1 Define the errand record model and the orphan state-ref read/write primitives**

- _Goal:_ A typed errand record round-trips through a per-slug blob in `refs/arc/user/{identity}/errands`, read
  and written without materializing any working-tree file.
- **Strategies:** strategy-testing-methodology.md, strategy-storage-evolution.md

    - `[x]` **2.1.a The errand record type + (de)serialization**
        - Built `ErrandRecord` (`{version, slug, origin, intent, branch, createdAt, originEntry?}`) with a
          byte-stable serializer and a tolerant deserializer (returns null on a malformed blob, never throws —
          mirrors the sync-state reader). `branch` carries the projection since the nature-typed prefix isn't
          slug-derivable; `originEntry` is present only for inbox-originated records, so origin reads uniformly.

    - `[x]` **2.1.b The orphan-ref per-slug tree read/write primitives**
        - Built `readErrandRecord` / `writeErrandRecord` / `removeErrandRecord` / `listErrandRecords` over the ref
          as a tree of per-slug blobs — reads on `GitExec` (`cat-file` / `ls-tree`), writes via `hash-object` /
          `mktree` / `commit-tree` / `update-ref`; an absent slug or ref reads back null, removal is surgical
          (no-op when absent), and nothing is materialized into the working tree.

- _Outcome:_ The errand record substrate lands as `lib/errand/` — model plus the four orphan-state-ref primitives,
  records-only (verified: clean `git status` and no `errands/` directory after a write). Tree/blob writes need a
  stdin-fed git seam the execFile-based `GitExec` can't provide, so added a `GitExecInput` seam (mirrors the
  user-notes `writeNote` spawn pattern) — the seam Task 2.2's tree-merge and Task 2.3's sync leg build on;
  `makeGitExecInput` added to the integration helpers.

### `[x]` **2.2 Implement the per-slug tree-merge (distinct-slug union / same-slug reject under non-fast-forward)**

- _Goal:_ On push/sync the ref fetches the remote, merges the per-slug tree, writes the merged tree as a new
  commit, and retries-with-refetch on non-fast-forward.
- **Strategies:** strategy-testing-methodology.md, strategy-storage-evolution.md

- _Outcome:_ Split into a pure `mergeErrandTrees` — the blob sha _is_ the byte-identity check, so distinct slugs
  union, a same-slug equal-sha entry is idempotent, and differing-sha entries surface as a sorted collision (all
  or nothing, never a partial merge) — and `reconcileErrandPush`, which on a non-fast-forward fetches the remote,
  merges, and commits the union onto _both_ tips so the retry fast-forwards; a collision pushes nothing and leaves
  the local ref intact. Extracted the shared blob/tree plumbing into `ref-tree.ts` (the record primitives consume
  it too) and reused the user-sync non-fast-forward / remote-unavailable error classifiers.

### `[x]` **2.3 Extend the user-state sync machinery to carry the errand ref as a second leg**

- _Goal:_ The errand ref rides the existing paired-push + partial-push-marker path — pushed immediately at
  `open`, removal pushed at `close`, reconciled periodically by `arc sync` — so a sibling clone sees the record
  within the same window as the pushed branch.
- **Strategies:** strategy-testing-methodology.md, strategy-storage-evolution.md

- _Outcome:_ `arc sync` reconciles the errand ref as a **cross-cutting** step on every invocation — fetch the
  remote, tree-merge, push — cell-independent (it runs even on blocked worktree cells) and non-fatal (a failure
  records the errand partial-push marker for recovery but does not flip the sync exit code), surfaced as the sync
  envelope's `errand` field. Modeled as a cross-cutting reconcile rather than a leg of `runPairedPush` because the
  errand ref is identity-scoped, not WU/worktree-scoped — bundling it into the WU paired push would gate it on
  worktree success (wrong: the errand ref is independent) and mix scopes. This refines the approach's "second leg"
  framing (see the spec's § 5 alignment note). Added a parallel `partialPushErrand` marker in `sync-state.ts`
  (independent of the notes marker; carried across saves and the notes-marker clear), promoted `GitExecInput` to
  `lib/git` as a general stdin-fed seam, and wired the production `gitExecInput` onto `UserIOContext`.

## **Phase 3:** The `arc errand open` / `close` verb surface

_Purpose:_ Build the thin CLI surface — `open` (mint record + cut branch + occupy) and `close` (remove record +
reap branch + drop the slug-matched inbox entry) — honoring the cut→occupy contract in code. Scoped smaller than
the WU verbs: no `(phase, location)`, no relocation, no `active/` artifact.

_Design decisions:_ These are full-protection verbs — a partial-protection errand is a direct base commit with
no branch and no record, so it never invokes `open` / `close`. `open` composes the shipped `cutErrandBranch` +
the Phase 2 record-mint + occupy; `close` composes `removeErrandRecord` + branch/worktree reap + the shipped
`removeInboxEntry`. The inbox entry drops at completion (never at start), so an abandoned errand never orphans
the intent. Occupy default is the in-place switch until `finalize-parallelism` ships.

### `[x]` **3.1 `arc errand open <slug>` — mint the record, cut a nature-typed branch, occupy per protection mode**

- _Goal:_ `arc errand open <slug>` mints the identity record, cuts a nature-typed branch (`fix/` / `refactor/` /
  `chore/`) as the record's projection, and occupies per protection mode — never leaving the session on the
  launch branch.
- **Strategies:** strategy-testing-methodology.md, strategy-work-organization.md

- _Outcome:_ `arc errand open <slug> [--type] [--intent]` ships as a new `openErrand` core (`lib/errand/open.ts`)
  composing the branch cut + Phase 2 record-mint + record push + in-place occupy (`git switch`); a full-protection
  verb that refuses under partial protection (where an errand is a direct base commit, no branch/record). The push
  is non-fatal — a failure records the errand partial-push marker and rides `arc sync`. `cutErrandBranch` was
  **generalized** to a nature-`type` param (default `chore`), superseding the approach's "unchanged" note per
  spec § 5; the admissible set is owned by a new `branch-type.ts` — `fix`/`chore`/`refactor`/`hotfix`, the
  `branch-format` type set minus `feat` (a feature is spec-worthy → a work unit, not an errand). Intent defaults to
  the slug; origin is always `description` (inbox linkage is Phase 6). Reading a project's `branch-format.override`
  from code is a forward-compat seam (no method-override config-resolver exists yet), routed to
  `customization-arch-realign`.

### `[x]` **3.2 `arc errand close` — remove the record, reap the branch / worktree, drop the slug-matched inbox entry**

- _Goal:_ `arc errand close` removes the identity record, reaps the branch / ephemeral worktree and prunes the
  remote-tracking ref, and drops the slug-matched inbox entry at completion.
- **Strategies:** strategy-testing-methodology.md, strategy-work-organization.md

- _Outcome:_ `arc errand close <slug>` ships as `closeErrand` (`lib/errand/close.ts`): it reaps the branch, removes
  the record and pushes the removal (the same marker discipline as `open`), and the handler drops the
  `originEntry`-matched inbox capture via the shipped `runUserInboxRemove`. A full-protection verb, like `open`. The
  reap is **containment-safe** (the settled design call): the local branch is force-deleted only when its commits
  are provably preserved — contained in `origin/<branch>` (pushed) **or** in `base` (merged), covering squash /
  rebase / merge — then the stale remote-tracking ref is pruned; an unprovable branch is refused **atomically**
  (record kept), so an abandoned errand stays recoverable, with a `--force` escape for the deliberate
  shipped / abandon override. The remote branch is never deleted (the PR owns that). Inbox-drop keys on
  `record.originEntry` — present only for inbox-promoted errands, so a Phase-3 description errand is a clean no-op
  (the inbox→errand crossing edge lands in Phase 6). Fixed a Phase 2 substrate bug this task surfaced: removing the
  **last** record left an empty tree that `mktree` rejected (`ref-tree.ts`), now regression-covered. The one
  residual reap gap — a squash-merge whose remote-tracking ref was already pruned, where `--force` is still needed
  — is captured for `operational-state-docs` (auto-clear via a live-PR merge-status read).

## **Phase 4:** Record-owned identity migration

_Purpose:_ Move errand identity off the branch parse and onto the record — migrate the session-init errand
probes to record reads, retire `errandSlugOf`, and make `fix/` / `refactor/` / `chore/` branches all resolve as
errands via the record.

_Design decisions:_ The branch becomes a projection of the record; identity moves to the record while merge
status stays a live PR/branch read. Branch-prefix decoupling is additive (`chore/` stays valid). No backfill
mechanism — the session-init probe shows zero in-flight errands, so no record-less errand is expected at ship; a
stray legacy branch degrades gracefully to branch-derived behavior.

### `[x]` **4.1 Migrate the session-init errand probes to record reads**

- _Goal:_ The errand probes resolve identity and state from the record, not by parsing `chore/<slug>` —
  `detectErrandResume`, `classifyInFlightErrands`, `findMaterializableErrands`, and their `runErrandState`
  composition read the record.
- **Strategies:** strategy-testing-methodology.md

- _Outcome:_ `runErrandState` now takes injected errand `records`, derives a `branch→slug` index from them, and
  feeds all three probes — identity resolves from the record while presence / merge / age stay live oracle reads.
  `detectErrandResume` resolves the current branch's slug from the index (any nature-typed prefix, where a `chore/`
  parse would fail); `classifyInFlightErrands` consumes a record-resolved slug, shedding its `hasMeta` /
  `errandSlugOf` role (errand-vs-WU classification is the oracle's job upstream); `findMaterializableErrands`
  resolves remote-only candidates' slugs from the index. A record-less branch degrades to the oracle's
  branch-derived slug, so a stray legacy errand keeps working. The handler (`status.ts`) reads the records via
  `listErrandRecords`, identity-gated (empty when identity is absent, the no-record-ref case). `errandSlugOf` now
  survives only as `detectErrandResume`'s legacy fallback — teeing up its retirement and the branch-prefix
  decouple in 4.2.

### `[x]` **4.2 Retire `errandSlugOf`'s branch-parse and decouple the branch prefix**

- _Goal:_ `errandSlugOf` is removed once no probe depends on it, and a `fix/` or `refactor/` branch resolves as
  an errand via the record — the branch prefix no longer carries errand-ness.
- **Strategies:** strategy-testing-methodology.md

- _Outcome:_ `deriveInFlight`'s `classifyBranch` now classifies errand-vs-WU from an injected `branch→slug` index
  (the errand records), not the `chore/` prefix: a branch carrying a record is an errand whatever its prefix; a
  record-less branch resolves by meta presence (so a promoted errand → WU still reads as a WU). Resume detection
  drops its branch-parse fallback (record-only). The three `deriveInFlight` callers — session-init (`status.ts`,
  sharing one memoized records read across the oracle and the errand-state probe), `arc active in-flight`, and the
  STATUS.USER view — resolve the index via a new `readErrandSlugByBranch` helper (`lib/errand/record.ts`), backed by
  a narrowed read-only `ErrandRecordReadIO` (reads no longer demand the stdin write seam). `errandSlugOf` and its
  module are deleted; grep + typecheck confirm no caller remains.
- _Deviation:_ The whole `errand-branch.ts` module was deleted, not just `errandSlugOf`. The task kept
  `ERRAND_BRANCH_PREFIX` as a "cut default", but Phase 3 had already moved the cut default to `branch-type.ts`
  (`DEFAULT_ERRAND_BRANCH_TYPE`), leaving `ERRAND_BRANCH_PREFIX` with zero consumers — dead code, so it went too.
- _Also retired:_ `write-context.ts`'s `errandSlug` dimension — its sole basis was the branch parse and it had no
  production consumer (tests only), so it was removed with the parse rather than re-sourced from the record.

## **Phase 5:** Personal capture surface relabel

_Purpose:_ Land the gate in the personal surface — relabel the `USER-INBOX` sections to `## Errand` / `## Work
Unit` with new-model preambles, and update the coupled code in lockstep so no inbox read or the `removeInboxEntry`
write regresses. This phase is the _functional_ relabel (content + code); the prose surfaces that _describe_ the
sections (skills, strategy doc) re-base in Phase 6.

_Design decisions:_ Content and code edited together; the `WU_Target` field stays on `## Work Unit` entries and
rides the entry `raw` verbatim. A one-time content + `ENTRY_SECTIONS` edit applied with the parser / probe
updates — no migration mechanism.

### `[x]` **5.1 Relabel the `USER-INBOX` sections and rewrite the preambles to the spec-worthiness model**

- _Goal:_ `USER-INBOX` reads `## Errand` / `## Work Unit` with preambles stating the spec-worthiness model; the
  live entries migrate under the new headings and `WU_Target` stays on `## Work Unit` entries.
- _Outcome:_ Relabelled `## Atomic` → `## Errand` and `## Backlog` → `## Work Unit` with spec-worthiness preambles
  (errand = below both intrinsic floors, atomic or multi-increment; work unit = clears either floor) in both the
  live `.arc/user/andrew/USER-INBOX.md` and the adopter template `templates/user/USER-INBOX.md`. Live entries
  migrated 1:1 (heading-only move, no drain-time re-triage); `## Removed:` tombstone `_Section:_` values left
  historical. Content-only — the coupled section code (`ENTRY_SECTIONS`, parser, probes) re-bases in Task 5.2, so
  inbox reads regress against the renamed headings until then.

### `[x]` **5.2 Update the coupled inbox-section code in lockstep, tests green**

- _Goal:_ Every place the section labels are hardcoded reads `Errand` / `Work Unit`, and the inbox
  reader / writer / probes operate on the renamed sections with their tests green.
- _Outcome:_ Renamed the section literals — `ENTRY_SECTIONS` (`inbox-writer.ts`) and the parser loop
  (`parser.ts`) now drive `Errand` / `Work Unit`, and the reminder filter (`inbox-reminders.ts`) gates on
  `Errand`, preserving the single-section nudge scope (`Work Unit` is never nudged). `section` is an open
  `string` on `CrossWuEntry`, so no type change was needed — only doc comments updated in `types.ts` /
  `inbox-state.ts`. Test fixtures migrated across the unit, integration, and e2e suites; tombstone
  `_Section:_` values left historical.

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
