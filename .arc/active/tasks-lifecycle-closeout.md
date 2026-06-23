# Task List: lifecycle-closeout

- **Design:** `spec-lifecycle-closeout.md`

---

## **Phase 1:** Wiring completions

_Purpose:_ Complete the half-built lifecycle edges the create-spec audit confirmed, so the certifying audit
(Phase 5) runs against a substrate that does what the model says — and so the inbox-drain prose sweep (Task 3.3)
documents a mechanism that actually fires. Code-bearing edges land first; the doc sweep that describes them
follows.

_Design decisions:_ Task 1.1 lands before its describing prose (Task 3.3) — the drain that prose documents is dead
until the producer leg ships. Task 1.4 (W3) is verify-only: the out-of-band teardown already shipped at
`808213c6`, so it confirms no stale prose survives rather than changing code. TypeScript under
`packages/arc-framework/src/` is single-copy (no mirror); the workflow / skill / template call-sites threaded in
Task 1.1.c are framework _content_ and carry the two-copy mirror. See `notes-lifecycle-closeout.md` § Code
residual surfaces for the grounded symbol/file inventory.

### `[x]` **1.1 Errand inbox-drain provenance producer-leg**

- _Goal:_ An inbox-drained errand records its originating capture, so `arc errand close` drops that capture
  instead of orphaning it.
- **Strategies:** strategy-testing-methodology.md

    - `[x]` **1.1.a Thread an originating entry through `openErrand`**
        - `lib/errand/open.ts`: added `originEntry?` to `OpenErrandParams`; mints
          `origin: originEntry ? "inbox" : "description"` with the conditional `originEntry`.

    - `[x]` **1.1.b Add the `--from-inbox <entry-slug>` flag to `arc errand open`**
        - `handlers/errand.ts` `ErrandOpenOptions.fromInbox` + the `cli.ts` flag, threaded to `openErrand` as
          `originEntry`; the success line names the adopted capture.

    - `[x]` **1.1.c Thread the flag from the adoption call-sites**
        - `run-errand.md` Launch, `session-init.{md,template.md}` cold-entry, the `arc-errand` skill, and
          `drain-inbox.md` § 6's `run-errand` hand-off — each passes the originating capture (both copies mirrored).

- _Outcome:_ Producer leg live end-to-end — `arc errand open --from-inbox <title>` mints an `inbox`-origin record
  and `arc errand close` drops the capture (e2e-covered). The doc threading lands at the genuine adoption points:
  `drain-inbox` § 5's grooming `open` batches many routing writes (not a single-capture adoption), so the thread
  goes to § 6's `run-errand` hand-off instead of the § 5 `open`.

### `[x]` **1.2 Resolver state-query trigger rewire**

- _Goal:_ `integrate-work-unit` resolves fresh-vs-resume entry mode from the resolver's derived enum, not a
  hand-read of meta `**State:**`.
- _Outcome:_ Repointed the Step 1 entry-mode dispatch (and its two arm headers) in `integrate-work-unit.md` to
  `arc status {name} --json`'s derived `state` (`active` → fresh, `integrating` → resume); both mirror copies.
  Left the consistent surfaces untouched per scope — the precondition-gate `**State:**` checks (each verb
  re-guards), session-init's `sessionType`, the multiple-candidate tiebreaker, and the `gh pr view` PR-state read.

### `[x]` **1.3 Nested-parent `{NN}b` archival cascade**

- _Goal:_ A nested-parent cohort archives correctly — the archive sweep applies the `{NN}b` cascade to the nested
  parent alongside the existing `{NN}a` cohort-sidecar cascade.
- **Strategies:** strategy-testing-methodology.md
- _Outcome:_ Added `isArchivalTriggeredWithDescendants` (`lifecycle-membership.ts`) — counts a parent's direct +
  subcohort members transitively (trailing-slash prefix, so a sibling like `parent-other` doesn't false-match) —
  and `cohortParent` (`cohort-path.ts`). `archive.ts` now gates the leaf sidecar on the descendants-aware trigger
  (the "both paths" choice: a parent doc is never swept while a subcohort lingers) and `sweepNestedParentDoc`
  emits the `{NN}b_cohort-<parent>` sidecar when a nested member's ship also closes the parent. `runArchive`
  returns `nestedParentSwept`; the handler surfaces it. Suffix reads inner → outer within an `NN` (leaf `a`,
  parent `b`).

### `[x]` **1.4 Verify `abandon` out-of-band teardown + drain routed follow-up**

- _Goal:_ No surface describes in-verb `abandon` teardown, and the routed follow-up `decompose-matrix` filed is
  drained.
- _Outcome:_ Verify-only — confirmed consistent, no changes. `abandon.ts` defers started-state
  (`planning`/`active`) branch+worktree teardown to the out-of-band `arc teardown --force` (`IN_VERB_BRANCH_DELETE`
  is `parked`-only); `deactivate-work-unit.md` Case A-delete (both copies) documents that staged-then-`arc teardown`
  flow with no stale in-verb prose; and the routed `abandon@{Planning,Active}` follow-up is drained from
  `USER-INBOX` (slug-matched on the W3 ship at `808213c6`).

## **Phase 2:** Verb-register sweep + `graduate → promote` rename

_Purpose:_ Make the durable corpus name the shipped verb set — the cross-cutting rename and token-triage no single
prior member owned — and reconcile the one-position-corpus-wide "a draft is always meta-bearing" stance the audit
surfaced. The mechanical rename + repoint is separated from the corpus-wide token rewrite so each is its own
review increment.

_Design decisions:_ Every framework-content surface edited across Phases 2-5 has a byte-identical
`packages/arc-framework/arc/` mirror twin edited in lockstep (per `strategy-package-project-sync.md`); the cohort
doc under `backlog/planned/` is internal-dev and unmirrored. "readiness ladder" (the `provisional → planned →
active` rung concept) is deliberately preserved — only the transition verb/noun `graduate`/`graduation` is
rewritten. See `notes-lifecycle-closeout.md` § A1 for the grounded hit inventory and the false-positives list.

### `[x]` **2.1 Rename `graduate-work-unit.md → promote-work-unit.md` + repoint references**

- _Goal:_ The ceremony ships as `promote-work-unit.md` (both copies) with its title and every reference-link label
  repointed — no dangling `[graduate-work-unit]` reference remains.

    - `[x]` **2.1.a Rename the file and retitle it** (both copies)
        - `git mv` to `promote-work-unit.md`; retitled the `# Workflow:` heading to `Promote Work Unit`. Title
          only — the frontmatter `purpose` and body `graduat*` tokens stay for Task 2.2.

    - `[x]` **2.1.b Repoint the reference-link consumers**
        - `init-work-unit.md` (label use + `:` definition) and `strategy-work-organization.md` (two label uses +
          `:` definition) repointed to `promote-work-unit`; both mirror copies.

- _Outcome:_ Mechanical rename complete across both copies; a corpus grep confirms no `graduate-work-unit`
  reference-link survives in durable surfaces (the `graduat*` prose token sweep is Task 2.2).

### `[x]` **2.2 Token-triage `graduat*` + surface `demote` + session-init register parity**

- _Goal:_ Every durable surface names the shipped transition verb (`promote`, with `demote` as its inverse)
  instead of the retired `graduate`/`graduation`, while the reserved "readiness ladder" concept and genuine
  false-positives stay untouched.

    - `[x]` **2.2.a Rewrite the `graduat*` transition verb/noun across the corpus**
        - Swept 13 durable surfaces (both copies): `init-work-unit.md` (11 hits), `resume-work-unit.md`,
          `park-work-unit.md`, `activate-work-unit.md`, `create-spec.md`, `draft-design.md`,
          `classify-work-unit.md`, `strategy-team-coordination.md`, `strategy-session-operations.md`,
          `STRATEGY-INDEX.md`, `strategy-work-organization.md`, and the `arc-inbox` skill. Verb split by edge:
          `provisional → planned` → **promote/promotion**; `planned → active` (the `init`/`start` edge) →
          **initialize/start**, never promote; relocation-sense hits → **relocate**. Deleted the circular
          "Graduation names a readiness-ladder promotion" self-definition; kept the concept term "readiness
          ladder" and the false positives (`graduated lookup`, `draft-* → notes-*` content-promotion).
        - Held in-scope-elsewhere, untouched here: `commit-footer.md` `(graduation)` category + the
          promote/park/resume ceremony commit-message example blocks → Task 3.4; `strategy-planning-module.md`
          / `strategy-work-planning.md` dense pipeline vocab → Task 4.2.a.

    - `[x]` **2.2.b Surface `demote` as `promote`'s inverse**
        - Added an `## Inverse — demote` section to `promote-work-unit.md` (both copies): `arc demote`
          (`planned → provisional`), the unguarded cohort-aware backlog move with a sticky-Class ratchet, no
          standalone ceremony. The command-catalog entry rides with Task 3.2.a, which owns the full lifecycle-verb
          catalog population (the section carries zero lifecycle verbs today — `promote`/`demote` land there as a
          pair; seeding `demote` alone would be an incoherent intermediate).

    - `[x]` **2.2.c Bring the session-init discovery arm to start-verb register parity**
        - `session-init.md` (rendered) + `session-init.template.md`: named `arc start` / initialize / scaffold in
          the discovery "propose next steps" item and the full-protection note. The non-git `arc:if` arm (partial
          protection — no branch ceremony) carries no start verb and is left register-correct.
          `decompose-work-unit.md` "activates each member" → "initializes" (the `planned → active` edge); the
          `activate-work-unit.md` "graduated to PRD" cosmetic already landed in 2.2.a.

    - `[x]` **2.2.d Correct the cohort doc**
        - `cohort-lifecycle-state-machine.md`: dropped the phantom `idiomatic-alignment` soft-coordination bullet
          (register check re-homed into this WU), rewrote `graduate-not-scaffold` → `initialize-not-scaffold`, and
          refreshed the `lifecycle-closeout` member entry to name the Phase 1 wiring scope. Kept `graduation-cleanup`
          (proper noun); left the as-is evidence-spine baseline and the Phase 5 errand-residue item untouched.

- _Outcome:_ The durable corpus now names the shipped verb set — `promote` / `demote` for the backlog rung,
  `initialize` / `start` for the `planned → active` edge — with the "readiness ladder" concept preserved. Scope
  reconciliation worth recording: 2.2.b's command-catalog half defers to Task 3.2.a's full lifecycle-verb catalog
  population (a verb-less catalog can't coherently carry `demote` alone). A residual-`graduat*` audit confirms only
  intended keeps remain (content-promotion senses, `graduated lookup`, and the Task 3.4 / 4.2.a held items).

### `[ ]` **2.3 Reconcile the "no meta-less draft" position**

- _Goal:_ The corpus states one position — a draft is always meta-bearing (a provisional/planned stub or an active
  Planning WU from inception); protection mode shapes only the ship layer (branch/PR), never the record.
- _Note:_ This governs WU artifacts, not errands (legitimately meta-less `chore/<slug>`, owned by
  `errand-lattice`) — do not over-correct errand-no-meta language.

    - `[ ]` **2.3.a Fix the real contradiction**
        - `strategy-work-organization.md` § Partially Protected — it ties meta-lessness to partial protection
          ("no planning branch or meta yet"); decouple it.

    - `[ ]` **2.3.b Sharpen the temporal phrasing**
        - `draft-design.md` (two spots) — pre-WU base-drafting "no meta yet"; make the "minted at `init`" temporal
          sense explicit so it reads as no contradiction.

## **Phase 3:** Ceremony coherence + agent-facing surfacing

_Purpose:_ Close verb↔ceremony coverage by giving `reopen` the judgment-half ceremony every other lifecycle verb
has, surface the resolver state-query where agents reach for it, and correct the drifted inbox-drain prose (gated
on Task 1.1 landing).

### `[ ]` **3.1 Author `reopen-work-unit.md` + ceremony-corpus coherence**

- _Goal:_ `reopen` gains the judgment-half ceremony every other lifecycle verb has, and the integrate ceremony
  names its inverse.

    - `[ ]` **3.1.a Author `reopen-work-unit.md`** (both copies)
        - Own file — the inverse of `integrate-work-unit.md` (own-file precedent: `deactivate-work-unit.md`).
          Drives `arc reopen [--keep-pr]`; the judgment is the withdraw-vs-stay-integrating call.

    - `[ ]` **3.1.b Add the integrate → reopen inverse back-link**
        - `integrate-work-unit.md` does not currently name its own inverse; add the back-link.

    - `[ ]` **3.1.c Audit the ceremony corpus for residual symmetry gaps**
        - Sweep for residual coverage / inverse-pair / cross-reference gaps surfaced while in the ceremony corpus.

### `[ ]` **3.2 Surface the resolver state-query to agents**

- _Goal:_ The lifecycle verb set is discoverable where agents reach for it — the on-demand command catalog (the
  **complete** verb index, `arc status <slug>` included) and the always-loaded behavioral rule for state resolution.

    - `[ ]` **3.2.a Populate the QUICK-REFERENCE verb catalog** (both copies)
        - QUICK-REFERENCE § ARC CLI Commands — add the full lifecycle-verb set at parity with its siblings
          (on-demand reference; the section carries zero lifecycle verbs today): `arc status <slug>`, `start`,
          `park` / `resume`, `activate` / `deactivate`, `promote` / `demote`, `reopen`, `abandon`, `archive`,
          `stub`, `decompose`, `teardown`, `plan check`, and the errand verbs (`open` / `close` / `promote` /
          `retire`). Per the verb-inventory bucketing the full set lands here, not in DEV-RULES; the
          workflow-trigger-only internals (`set-stage`, `repoint-design`) stay out of the catalog.
        - Mark the **judgment-light verbs that have no standalone workflow** explicitly — `demote`, `teardown`,
          `stub` (confirm the exact set against the `work-unit-lifecycle/` file list at execution) — each with a
          one-line "no ceremony — see X" pointer (e.g. `demote` → `promote-work-unit.md` § Inverse). Closes the
          Task 2.2.b deferral: `demote`'s catalog entry rides here, paired with `promote`.
        - Add a short orienting line: the catalog is the **complete** verb index; the `work-unit-lifecycle/`
          workflow files are the judgment-bearing subset, so a verb without a workflow is by design, not a gap.
        - _Note:_ The workflow directory reads as one-file-per-verb, but the CLI-mechanics split deliberately
          produces verbs without ceremonies. Absent the catalog as the named complete index, each judgment-light
          verb looks like a missing file — the DX gap this subtask closes (surfaced reviewing Task 2.2's `demote`
          note, which is discoverable only by already knowing it is `promote`'s inverse).

    - `[ ]` **3.2.b Add the always-loaded DEV-RULES rule** (both copies)
        - DEV-RULES.ARC § Verification and Discovery → "Verify before assuming" — resolve a WU's lifecycle state by
          slug via `arc status <slug>` rather than inferring from directory, branch, or a state-blind `Depends On`
          edge. Terse statement + inline command only (always-loaded budget); the worked example, `--json` detail,
          and rationale belong on QUICK-REFERENCE / strategy surfaces.

### `[ ]` **3.3 Correct the drifted inbox-drain prose**

- _Goal:_ Every surface describes the shipped drain mechanism — `arc errand close` drops the inbox capture named
  by the recorded `record.originEntry` back-pointer — not a capture found by matching the errand's own slug.
- _Context:_ Gated on Task 1.1 landing — the producer leg is what makes the back-pointer real.

    - `[ ]` **3.3.a Sweep the workflow / rule surfaces** (both copies)
        - `run-errand.md` (Complete), `drain-inbox.md`, `init-work-unit.md` (Promote path), and `DEV-RULES.ARC`
          § Discovered Work Routing ("removed at completion (slug-matched)").

    - `[ ]` **3.3.b Fix the stale code comment**
        - `lib/errand/close.ts` module-doc comment (single copy — TypeScript source).

### `[ ]` **3.4 Fold lifecycle-ceremony commit footers to a validator-accepted token**

- _Goal:_ No lifecycle ceremony ships instructing a commit footer the `commit-msg` validator rejects. The
  promote / park / resume ceremonies prescribe `(graduation)` / `(park)` / `(resume)` — none in the validator's
  meta set (`handoff | activation | integration | archival | deactivation | maintenance | incidental`), so each
  hard-fails under `commit.context_footer: required` if run.
- _Context:_ Bounded consistency fix only. The fuller meta-category reconciliation — legible own-markers
  (`(promotion)` …), the `decomposition` / `(activation)` forks, and the method+hook+test sync — is
  `naming-conventions`' (routed to `USER-INBOX`; it owns the commit-msg hook + already carries the concern).
  `(maintenance)` is the legible, already-accepted interim (`decompose`'s precedent); see DEV-RULES.ARC § Commit
  and PR surface language for the legibility rationale (the footer must read without ARC knowledge — `(park)` /
  `(resume)` don't nominalize, so own-markers wait on naming-conventions).

    - `[ ]` **3.4.a Fold the three ceremony commit-message blocks to `(maintenance)`** (both copies)
        - `promote-work-unit.md`, `park-work-unit.md`, `resume-work-unit.md`: set each example commit-message block
          to the shipped verb + a `(maintenance)` footer (e.g. `chore(arc): promote {name} to planned` /
          `Context: meta-{name}.md (maintenance)`). This is where the ceremonies' subject-verb `graduat*` tokens
          are rewritten too (held out of Task 2.2's prose sweep).

    - `[ ]` **3.4.b Drop the orphaned `(graduation)` bullet from `commit-footer.md`** (both copies)
        - Remove the `(graduation)` meta-category bullet — no ceremony uses it after 3.4.a and the validator never
          accepted it. Adding any new category (e.g. `(promotion)`) stays `naming-conventions`'.

## **Phase 4:** State-model vocabulary + adjacent-strategy fold-in

_Purpose:_ Document the state-model vocabulary the prior members built — the `(phase, location)` two-axis model,
the derived-state names, the `Parked` render bucket — in `strategy-work-organization`, and fold the verb rename
into the two adjacent strategies carrying dense `graduation`-pipeline vocabulary. These are additions, not just
edits, so they get a phase distinct from the verb-register sweep. Task 4.2 also retires the orphaned
`arc errand cut` command — a CLI removal plus its § The cut→occupy invariant rewrite, co-located here because that
invariant lives in `strategy-work-organization.md`.

_Design decisions:_ The `Parked` render bucket is an _addition_ (absent today) carrying the interim hand-render
discipline — not a verify-landed item. See `notes-lifecycle-closeout.md` § A6 for the section-by-section target
map.

### `[ ]` **4.1 `strategy-work-organization` model + render-bucket additions**

- _Goal:_ `strategy-work-organization` carries the state-model vocabulary readers reach for — the
  `(phase, location)` model, derived-state names, the `Parked` render bucket, the `stub` required-fields policy,
  and the protection-mode ship-layer framing.

    - `[ ]` **4.1.a Add the `(phase, location)` model + `Active`/`active/` disambiguation**
        - § Work Unit State — the two orthogonal axes (phase = meta `State`; location = `provisional` / `planned`
          / `active` / `completed` as a logical value), sharpest in the parked case (`State: Active` while
          physically in `backlog/planned/`).
        - Keep distinct from § Class Model's existing `### The two axes` (the derivation / scale Class axes) — same
          phrase, a different pair.

    - `[ ]` **4.1.b Add the derived-state vocabulary + `Parked` render bucket**
        - § ROADMAP render / STATUS.USER — the derived-state names and the `Parked` bucket (absent today) with the
          interim hand-render discipline.

    - `[ ]` **4.1.c Add the `stub` required-fields policy statement**

    - `[ ]` **4.1.d Add the protection-mode ship-layer framing**
        - § Branch Protection Modes — protection shapes the ship layer (branch/PR), never the record.

### `[ ]` **4.2 Adjacent-strategy verb fold-in + `arc errand cut` removal**

- _Goal:_ The adjacent strategies carry no retired `graduation`-pipeline vocabulary, and the orphaned
  `arc errand cut` command is gone with its invariant reframed around `open`.

    - `[ ]` **4.2.a Fold the verb rename into the adjacent strategies** (both copies)
        - `strategy-work-planning.md` and `strategy-planning-module.md` — both carry dense `graduation`-pipeline
          vocabulary.

    - `[ ]` **4.2.b Deregister the `arc errand cut` command**
        - Remove the `cut` command from the CLI (`cli.ts` registration + the `handleErrandCut` import) and
          `handleErrandCut` (with its now-unused `cutErrandBranch` import) from `handlers/errand.ts`. `open` is the
          sole errand entry verb; the standalone command exposes the cut half without the mandatory occupy, so it
          has no correct use.
        - Rewrite `strategy-work-organization.md` § The cut→occupy invariant (both copies): keep the invariant —
          every internal cut site must occupy — but reframe it around `open`'s composed `cutErrandBranch` step,
          not a user-facing `arc errand cut` command. The internal `cutErrandBranch` mechanic stays (composed by
          `open`).
        - Drop the removed command's test coverage; `cutErrandBranch`'s own coverage stays.

## **Phase 5:** Certifying consistency audit

_Purpose:_ The completion-time global-consistency pass that certifies the swept substrate matches the shipped
model — no documented-but-unbuilt transition, no half-migrated mechanic, no doc describing the retired verb set —
across both copies, with mirror parity asserted as a closeout invariant.

### `[ ]` **5.1 Run the certifying consistency audit across both copies**

- _Goal:_ The swept substrate is certified against the model: no retired-verb description, no documented-but-
  unbuilt transition, no half-migrated mechanic — and mirror parity holds across `.arc/` and
  `packages/arc-framework/arc/`.
- _Approach:_ Consume the grounded findings inventory (`notes-lifecycle-closeout.md`) and the verify-landed
  checklist.

    - `[ ]` **5.1.a Verify the verb-set sweep**
        - No durable surface (both copies) names a retired transition verb (`graduate`/`graduation`, the
          `--lifecycle` flag spelling, slug-matched-drain language); `promote-work-unit.md` exists with title +
          link-refs repointed; "readiness ladder" preserved. Resolve the `multi-increment errand → extended
          errand` stale framing in the cohort doc.

    - `[ ]` **5.1.b Verify the built edges against the model**
        - The verify-landed checklist: W1 producer leg, W2 rewire, and W4 `{NN}b` cascade present; ADR-027
          `Accepted`; the embedded meta-template carries `Current Workflow` + the `[begin current workflow]`
          sentinel. No documented transition lacks substrate.

    - `[ ]` **5.1.c Verify mirror parity**
        - Every edited framework-content surface matches its `packages/arc-framework/arc/` twin.

    - `[ ]` **5.1.d Settle the standing-check question**
        - Decide whether the audit leaves a standing mechanical check (a guard asserting docs match the transition
          table) or remains a one-time manual pass.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` No durable surface (both copies) names a retired lifecycle transition verb: `graduate-work-unit.md` is
  gone, `promote-work-unit.md` exists with title + all link-refs repointed, "readiness ladder" is preserved, and
  `--lifecycle` / slug-matched-drain language is gone
- `[ ]` `arc status <slug>` appears in QUICK-REFERENCE § ARC CLI Commands and as an always-loaded DEV-RULES.ARC
  rule
- `[ ]` `strategy-work-organization` carries the `(phase, location)` model, the derived-state vocabulary, the
  `Parked` render bucket + interim hand-render discipline, the `stub` required-fields policy, and the
  protection-mode ship-layer framing
- `[ ]` `strategy-work-planning` and `strategy-planning-module` carry no retired `graduation` vocabulary
- `[ ]` `arc errand cut` is removed from the CLI and § The cut→occupy invariant is reframed around `open`'s
  composed cut; the internal `cutErrandBranch` mechanic is unaffected
- `[ ]` `arc errand open` accepts an originating-capture argument that mints `origin: "inbox"` + `originEntry`, and
  an inbox-drained errand's capture is dropped at `arc errand close`
- `[ ]` `integrate-work-unit` resolves entry mode from the resolver, not a hand-read of meta `**State:**`
- `[ ]` A nested-parent cohort archives correctly via the `{NN}b` cascade
- `[ ]` `reopen-work-unit.md` exists and drives `arc reopen`; `integrate-work-unit.md` links its inverse
- `[ ]` The certifying audit asserts — across both copies — no documented-but-unbuilt transition, no half-migrated
  mechanic, no retired-verb description; mirror parity holds
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration
