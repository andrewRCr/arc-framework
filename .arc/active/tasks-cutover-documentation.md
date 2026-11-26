# Task List: Cutover Documentation

- **Design:** `spec-cutover-documentation.md`

---

## **Phase 1:** The landed head, the inventory, and the closing read

_Purpose:_ Settle what the writing rests on before any of it starts: that the prerequisites have landed, that each claim
marked ‡ holds, which passages are false, and which ADR sentences need a record. Each can return to the Owner or the
specification, so each comes before the text it would change.

_Mode:_ `layer` through Phase 2 — closes on a confirmed inventory, the store model's one home, and the Errand decision,
which every later rewrite and amendment points to.

### `[ ]` **1.1 The prerequisites and the ‡ claims checked at the landed head — § 9**

- _Goal:_ The build starts only on a head where the cutover and `projection-team-scale` have landed, and every claim the
  specification marks ‡ is confirmed there or corrected by amendment before any text relies on it.

- **Additional Context:** `notes-cutover-documentation.md` § Grounding basis.

    - `[ ]` **1.1.a Confirm the prerequisites**
        - `arc status cutover-flip` and `arc status projection-team-scale` show both shipped, and this work unit's branch
          starts from `main` with both merges in it. Record that commit in the notes as the landed head.
        - If `projection-team-scale` has not landed, the order the rollout states has changed: stop for the Owner, who
          also decides the archive text of task 2.1 (spec § 2, § Migration and rollout).

    - `[ ]` **1.1.b Record which removals have landed**
        - For each of the cutover's other follow-ons (`arc status` for the tracked-state, notes, in-repo, and
          decomposition removals), record in the notes whether it has landed at this head, and list what its landing
          removed among the surfaces task 1.1.c checks: the notes commands, the merge-gate recipe's README and setup
          workflow with their links, the branch-kept arm of `arc join`'s message.
        - A surface a landed removal took is recorded as absent, and the task that edits it records the same. Spec § 5
          allows either landing order, so an absence it explains is not a failed claim.

    - `[ ]` **1.1.c Check each ‡ claim by § 9's list**
        - § 1: `template-contributing.md` still says "ownership of tracked state" in both copies; `buildPostJoinMessage`
          (`src/commands/join.ts`) still has the two messages § 1 describes, the one where state is kept off the branch
          naming the store, session-init, and the meta.
        - § 2: `.arc/system/.internal/manifest.json` is still tracked (`git ls-files`), and the archive is laid
          read-only and opened one file at a time with `arc edit` (its help, and `archive-work-unit.md`).
        - § 3: each symbol the six statements and four behaviors cite still does what the statement says, read in
          source, and `promoteOrdinaryErrand` (`lib/errand/promote.ts`) refuses outside full protection.
        - § 4: ADR-035 carries the cutover's amendments to items 2 and 8. For each row of § 4's table, the passage it
          names still reads as the row says, the rule it applies still fits by § 4's rules, and the record it names in
          place of the passage decides that matter in the landed code: an ADR-035 item as amended, or one of § 3's
          statements. Read each symbol a row cites in source (`FAMILY_REGISTRY`, `readBasis`, `prepareMutation`,
          `workUnitRights`, `mayRemoveEntry`, `clashRepair`, `occupyStoreGraduation`, `promotionMeta`,
          `runStoreDeactivate`, and any other).
        - § 5: `refuseWriteIfStoreImported` (`lib/store/store-imported.ts`) refuses notes writes, loads, and
          publication, a forced push among them, once the store is imported, unless the notes removal has landed.
        - § 6: the integration test "isolates a spawned worktree's current files and exact %s in-flight view"
          (`integration/store/projection/materialization.test.ts`) asserts what § 6's isolation bullet says;
          `readActiveLayout` (`lib/store/checkout-layout.ts`) and `projectOwnActive` (`lib/layout/projection.ts`) place
          the flat layout as § 6 says; the cutover's text holds `strategy-team-coordination.md` § Person-to-Person Task
          Handoff; and the lane's links and phrases, the three `strategy-session-operations.md` headings, and the two
          lock links in `01_verify-and-configure.md` stand where § 6 names them, apart from what task 1.1.b recorded as
          removed.
        - Record each check, the symbol or passage read, and its result in the notes. A claim that fails for any reason
          task 1.1.b did not record is a stop: enter `amend-design` over it, and write no text that relies on it until
          the amendment settles.

### `[ ]` **1.2 The inventory taken at the landed head — § 1**

- _Goal:_ Every passage in scope that the store makes false is listed with its document, its section, and the task that
  rewrites it, and every other hit has its reason, so the rewrites start from a complete list.

- _Note:_ Phase 3 and task 5.3 are drafted from the inventory taken at planning time and name sections rather than
  lines. This task's list governs where they differ.

    - `[ ]` **1.2.a The term search**
        - Search for § 1's terms: Git notes and user notes, notes refs, the `arc user` verbs, `SESSION-NOTES`,
          `STATUS.USER` and ROADMAP as files, `plan/` branches, artifacts described as committed or tracked, `git mv`
          archival, the auto-merge lane, and `archive.cadence: manual` as this repository's setting.
        - The corpus is every tracked document outside `docs/` and outside the kinds the Non-Goals leave unsearched
          (workflows, methods, skills, rules, templates, briefs, and help text), plus their two exceptions: the files
          holding § 6's lane links and phrases, and `template-contributing.md`.
        - Mark each hit in scope or name the Non-Goal or rule that leaves it. An ADR hit goes to task 1.3.

    - `[ ]` **1.2.b The concept read**
        - Read each in-scope document in full for what no term finds, by § 1's concepts: which artifacts are tracked;
          when another person or checkout sees a change; what a branch shows or carries; how concurrent edits settle;
          where a work item's lifecycle and identity are recorded; where a claim on a checkout is recorded; who may edit
          what, what settles a change to it, and what checks it; and what an external tool is needed for.
        - The two passages known at planning are among them: the planning-module strategy's external tracker for a
          live, branch-independent backlog, and `strategy-task-list-formatting.md`'s description of `meta-*`, `draft-*`,
          and `spec-*` as tracked artifacts.

    - `[ ]` **1.2.c Assign each passage and record the inventory**
        - Give each in-scope passage the Phase 3 or Phase 5 task that rewrites it. A passage no task names joins the
          task for its document or subject; one the specification's scope does not reach stops for `amend-design`.
        - List the tests that pin in-scope text: those § 1 names and any other the search finds, such as
          `framework-sync.test.ts`, which reads `strategy-session-operations.md` and `strategy-package-project-sync.md`.
        - Record the inventory, each hit's task or reason, and the pinned tests in the notes under § Inventory at the
          landed head.

### `[ ]` **1.3 The closing read of every ADR — § 4**

- _Goal:_ Every ADR sentence the store makes false is marked by at least one of two independent readers and has a row
  or a stated reason, checked by a third reader, before any amendment is written.

- **Additional Context:** `notes-cutover-documentation.md` § ADR passages left alone.

    - `[ ]` **1.3.a Two independent readers mark every ADR**
        - Each reader takes every sentence of every ADR, ADR-035 included and every amendment under any heading, and
          judges it against the landed code and the shipped specifications by § 1's concepts, taking no ADR as given.
        - Launch each as the host's delegation rule directs for review work. The brief carries the ADRs, § 1's concepts,
          § 4's four rules, and the landed tree; never the specification's table, the planning-time verdicts, or the
          author's view.

    - `[ ]` **1.3.b A row or a reason for each mark**
        - A marked sentence the table already holds keeps its row. Any other gets a row in the table's form (ADR,
          passage, rule, superseding record) or a stated reason to leave it, by § 4's rules, in the notes under
          § Closing read.
        - Stop for the Owner where the code and a shipped specification disagree on something § 3 does not state,
          before any ADR is written from either, and where a marked sentence is decided by no Accepted ADR and none of
          § 3's statements. § 3 gains no statement here.

    - `[ ]` **1.3.c A third reader accounts for every mark**
        - A third independent reader, launched the same way, compares the rows and reasons with both readers' marks.
          The read is done when no mark is unaccounted for. Record the readers, their reports, and the comparison in the
          notes.

## **Phase 2:** The store model's home and the Errand decision

_Purpose:_ Write the two documents the rest points to: the strategy the five rewritten strategies defer to for the
model, and the ADR whose number the superseded clauses cite.

_Exit criterion:_ The inventory and the closing read's rows are recorded with nothing waiting on the Owner,
`strategy-state-storage.md` ships in both copies with its recipe entry, index rows, manifest entry, and totals, and the
Errand ADR holds its six statements and four behaviors, each checked at the landed head.

### `[ ]` **2.1 `strategy-state-storage.md` written and shipped — § 2**

- _Goal:_ One shipped strategy says what is stored and what stays tracked, where the store lives, how it is projected,
  saved, and synced, and what a conflict or a removal outside ARC does to unsaved work, and a project installed from the
  recipe receives it.

- **Additional Context:** `notes-cutover-documentation.md` § Writing the shipped text.

    - `[ ]` **2.1.a Write the strategy**
        - In the package copy, `packages/arc-framework/arc/reference/strategies/arc/strategy-state-storage.md`, cover
          § 2's six subjects, naming verbs as the shipped workflows name them, and each claim about shipped behavior
          naming the code that does it: what is stored (`FAMILY_REGISTRY`, `lib/store/registry.ts`) and why nothing
          reads state through Git; where the store lives, its backends, the `storage.*` keys, when the backing
          repository is read (`composeRefStorePorts`, `lib/store/selection.ts`), how a clone designates where it
          publishes (`handleStoreRemote`, `commands/store-remote.ts`, and `applyRefRemoteSetting`,
          `lib/store/ref/remote-setting.ts`), and that the default gives clean history and not privacy; the projection,
          `active/current/`, `active/in-flight/<slug>/`, the view settings, `layout.active` (`readActiveLayout`), who may
          edit what (`workUnitRights`), and how to find projected files; saving, syncing, and what pushes when;
          conflicts; and what `git clean -x` and a plain worktree removal do.
        - The archive is laid read-only and opened one file at a time with `arc edit`, as task 1.1 confirmed.
        - Leave ceremony steps to the workflows, verb syntax to help text, and record formats to the schemas. Describe
          the store alone, never the machinery it replaced.

    - `[ ]` **2.1.b Ship it**
        - First, in `framework-sync.test.ts`, add a case naming `strategy-state-storage.md` that fails until the recipe
          installs it and its manifest entry reads `Framework` and `core`, beside the cases that pin other single
          shipped files the same way.
        - Add its `init-recipe.json` entry, an `ALWAYS load …` row in both `STRATEGY-INDEX.md` copies by targeted edits,
          the `.arc/` copy, and its entry in `.arc/system/.internal/manifest.json` (`Framework`, `core`, the package
          copy's SHA-256 as `pristine_hash`).
        - Compute the Framework total and the installed-files total from the recipe at this head and set them in
          `strategy-package-project-sync.md`: the Framework total in § Framework files and in § Summary, the
          installed-files total in § Summary. `framework-sync.test.ts` checks the manifest and the installed-files
          total; nothing checks the Framework total, so report the count and how it was computed.

### `[ ]` **2.2 The Errand ADR written — § 3**

- _Goal:_ One ADR, reading `Proposed`, decides the Errand as a stored work item in six statements, each naming the
  clauses it replaces, and states the four behaviors from the code that does them, as task 1.1 confirmed it.

- **Additional Context:** `notes-cutover-documentation.md` § Sources for the Errand ADR.

    - Number it as the next free number at this head (ADR-042 at planning), with an imperative title, in
      `.arc/reference/adr/`.
    - The Decision carries § 3's six statements with what each replaces, which protection mode each supersedes in
      (1–3 full, 6 partial, 4 both, 5 promotion only), and the four behaviors with their symbols. Context names the
      ADRs it supersedes in part. It leaves the work classes, the record test (ADR-037), and the review path untouched.
    - Context, Decision, and Consequences stand without planning history (`strategy-adr-methodology.md` § Reader
      independence). Task 4.4 accepts it: `lint:adr:status` refuses at the merge gate a change that adds an ADR
      reading `Proposed`.

## **Phase 3:** The shipped strategies and the rest of the in-scope text

_Purpose:_ Rewrite every in-scope passage the inventory holds outside the ADRs and the project's own strategies, one
document or one cross-file subject at a time, in both copies, with the tests that pin it.

_Mode:_ `replication` through Phase 5 — closes when the inventory, the closing read's rows, and the check-doc's
citations are exhausted at the final head.

_Design decisions:_ The rules every rewrite follows are in `notes-cutover-documentation.md` § Writing the shipped text.

### `[ ]` **3.1 The work-organization strategy describes the store — § 1, § 6**

- _Goal:_ `strategy-work-organization.md` describes work items whose lifecycle, identity, placement, and archive live in
  the store, with planning needing no branch and activation establishing the work branch, and points to
  `strategy-state-storage.md` for the model.

    - `[ ]` **3.1.a Branches and planning**
        - § Task Lists and Branches, § Branching with § Planning branches: `plan/<name>` and § Single branch per work
          unit, § Directory Structure, and § Alignment: planning needs no branch. A spawned start places the unit in a
          new checkout detached at the base's tip; `arc start --here` leaves the checkout's `HEAD` where it stands; under
          partial protection, work proceeds from the base checkout (`init-work-unit.md` § Execution Modes). Activation
          establishes the work branch in the checkout (`planActivationBranch`,
          `lib/work-unit/verbs/activation-branch-plan.ts`): it creates one at the base's tip from a detached checkout or
          one on the base. From any other branch it takes that branch over, keeping the name of a branch the unit
          already links when its type matches the type requested, as for a unit returned to Planning by
          `arc deactivate` or a promoted Errand, and otherwise renaming it to the requested name (`activationTarget`);
          a branch already at that name is adopted as it stands. Activation refuses when another branch holds the name
          it would use, when another work item links the branch, and when a detached checkout holds commits not on the
          base, each refusal naming how to keep the work. A unit decomposed or abandoned before activation can end with
          no branch or pull request.
        - A work unit's artifacts are stored records, projected into the checkout that holds it.

    - `[ ]` **3.1.b Per-worktree isolation**
        - § Per-Worktree Isolation becomes "`active/current/` holds only this checkout's work item", with the acceptance
          test task 1.1 confirmed: spawn a worktree for a work unit from base, and `active/current/` holds exactly that
          work unit's files plus a copy of each cohort document it names, `active/in-flight/` exactly the views the
          setting selects, and `active/`'s top level nothing else.
        - Say what `layout.active: flat` changes: the checkout's own item and its cohort copies lie flat in `active/`,
          and the in-flight views and the cohorts' own documents keep their places. Re-point § Main-on-Main Pattern's
          references to it.

    - `[ ]` **3.1.c Lifecycle, placement, and archival**
        - § Work Unit State, § The `(phase, location)` model, and § Readiness ladder: lifecycle is a record field and
          placement its projection.
        - § Archival and § Archive directory shape: the store's archive operation and each entry's order in its
          quarter, under either `archive.cadence` arm; the archive is laid read-only and opened with `arc edit`.

    - `[ ]` **3.1.d ROADMAP**
        - § ROADMAP and its subsections, and § `STATUS.USER` view, describe a status view with no file. The readiness
          and ordering doctrine stays. Keep any heading in the section that shipped text points at.

    - `[ ]` **3.1.e The Errand work class**
        - § Errand Work Class and its subsections give the full-protection Errand a lifecycle location and a description
          and the partial-protection Errand a commit on the base branch, as the Errand ADR decides. State each rule
          itself: the ADR does not ship, so the strategy does not cite it.

    - `[ ]` **3.1.f The other sections**
        - § Cohorts and its subsections (the cohort record, the nesting cap, decomposition), § Work Character,
          § Discovered Work During a WU, § WU Artifact Headers, § Spec-Flow Invariants, § Branch Protection Modes, and
          any other section the inventory lists; and a pointer to `strategy-state-storage.md`.
        - `locus-methodology-contracts.test.ts` and `decompose-doctrine-contract.test.ts` read this file: each assertion
          moves with the text it guards.

### `[ ]` **3.2 The auto-merge lane retired and the draft-state lock's model moved — § 6**

- _Goal:_ No in-scope text describes or links to the auto-merge lane, and the draft-state lock's model lives in
  `strategy-integration.md` beside § Terminal Integration Authority, with each link to it resolving whether or not the
  merge-gate recipe remains.

- _Approach:_ Every link into the lane uses the `#auto-merge-lane` anchor, and `lint:arc:links` runs at the commit gate,
  so the section is retired only after the last link into it is gone.

    - `[ ]` **3.2.a Move the lock's model and the links into the lane, in both copies, each where its file remains**
        - The draft-state lock's model (`merge.lock: draft`, `arc merge lock`) is written into `strategy-integration.md`,
          beside § Terminal Integration Authority. `review-gate-workflows.test.ts`, "arms no auto-merge from the planning
          classifier", reads the lock's model from the work-organization strategy: its assertions move to the
          integration strategy with the text.
        - The two links for the lock in `01_verify-and-configure.md` move to the integration strategy by a reference
          definition of their own.
        - The lane's links go with their sentences: one in `01_verify-and-configure.md`, one in `merge-gate/README.md`,
          and two in `setup-merge-gate.md`, and the pointer in `TECHNICAL-OVERVIEW.md`, whose draft-state lock sentences
          `pr-lifecycle.test.ts` pins and which stay. The recipe's own text is left for its removal.
        - "for both the manual- and auto-merge lanes" in `session-handoff.md` (`session-handoff.template.md` in the
          package) § Same-session finalize pass, and "or this one on the auto-merge lane" in `integrate-work-unit.md`
          where the same-session finalize pass runs, lose the lane. What each sentence requires stays.

    - `[ ]` **3.2.b Retire the section**
        - § Auto-Merge Lane retires with its subsections, § The housekeep drain among them, and its § Contents entry;
          § Discovered Work During a WU drops its pointer to it. No note of the removal is left.
        - Search both copies for `auto-merge-lane` and run `lint:arc:links`: no link into the section remains.

### `[ ]` **3.3 The concurrent-work and integration strategies describe the store — § 1, § 6**

- _Goal:_ `strategy-concurrent-work.md` describes concurrent work over the store, keeping the append-only rule without
  its notes rationale, and `strategy-integration.md`'s hand-back after the merge starts at delivery closeout.

    - `[ ]` **3.3.a The concurrent-work strategy**
        - § Worktrees by default and § What each checkout needs its own of; § Branch and rebase discipline and
          § Append-only until integration, whose rule keeps its text and loses the notes justification; § Async-merge;
          § The ROADMAP "Next" slice under concurrency; § Shared files under concurrency; § Parallelism incident
          playbook's ROADMAP conflict and notes-push entries; § Philosophy checkpoints; and a pointer to
          `strategy-state-storage.md`.
        - A work unit's locus ends at exact teardown or at `arc locus release` (`handleLocusRelease`,
          `handlers/locus-release.ts`).
        - `evidence-applicability-doctrine.test.ts` and `locus-methodology-contracts.test.ts` read this file: each
          assertion moves with its text.

    - `[ ]` **3.3.b The integration strategy's hand-back**
        - § Post-Landing Hand-Back drops its first step, the retirement of the personal session workspace, and keeps
          delivery closeout and then teardown. `evidence-applicability-doctrine.test.ts` reads this file too.

### `[ ]` **3.4 The session-operations strategy describes the store — § 1, § 6**

- _Goal:_ `strategy-session-operations.md` describes session state as the store keeps it, saved and synced by the
  shipped verbs, and keeps § Session State Portability, § Remote access boundary, and § USER-INBOX, which shipped text
  points at.

    - `[ ]` **3.4.a Loading and probes**
        - § Context Loading Model's load list and § Probe pattern's probe commands, with § Remote access boundary
          rewritten under its heading.

    - `[ ]` **3.4.b The meta file and the handoff**
        - § Meta-File Creation Contract and § Meta-File Timing: the meta is a stored record, and a handoff writes the
          store rather than a commit. § Orthogonal Ceremony, § Push-Timing Reasoning, § Recovery Procedures, and
          § Handoff-Interior Toggle Pattern lose the notes push.
        - `review-fix-release.test.ts` reads § Disposition-Approval Release up to the § Push-Timing Reasoning heading,
          so both headings stay in that order.

    - `[ ]` **3.4.c Personal files**
        - § User Workspace Directory, § SESSION-NOTES, § Working Memory, and § USER-INBOX describe the personal files as
          the store projects them and session context as a section of the meta.
        - § Session State Portability keeps its heading and points to `strategy-state-storage.md`; its notes mechanism
          and load-error recovery go.
        - `review-fix-release.test.ts`, `pr-lifecycle.test.ts` (the draft-state lock and "never infer merge safety"),
          and `framework-sync.test.ts` (the method trigger table) read this file: each assertion moves with its text.

### `[ ]` **3.5 The planning-module and team-coordination strategies describe the store — § 1, § 6**

- _Goal:_ `strategy-planning-module.md` describes the backlog, the inboxes, and commitment as stored records whose
  placement is projected, needing no external tracker for a live backlog, and `strategy-team-coordination.md` describes
  ownership and session state as the store holds them; both point to `strategy-state-storage.md`.

    - `[ ]` **3.5.a The planning-module strategy**
        - § What It Installs, § Inbox Family, § Shared-Inbox Write Discipline, § State-Dir Promotion, § Cohort Wrapper
          Subdirs, § When to Use Arc-in-Git with its external tracker for a live, branch-independent backlog, and
          § Relationship to Core ARC.

    - `[ ]` **3.5.b The team-coordination strategy**
        - § Workflow Adaptations, § Interlock-Release Coordination, § Session State Merge Behavior, § ARC as Execution
          Layer, and § Related Documentation. § Person-to-Person Task Handoff stays as it is, which
          `session-authority-docs.test.ts` pins.

### `[ ]` **3.6 The remaining shipped passages, comments, and project documents — § 1**

- _Goal:_ Every other in-scope passage outside the ADRs and the project's strategies reads true of the store: the
  smaller shipped strategies, `TECHNICAL-OVERVIEW.md`, the root `README.md`, two configuration comments, and
  `template-contributing.md`'s sentence.

    - `[ ]` **3.6.a The smaller shipped strategies**
        - `strategy-task-list-formatting.md`'s tracked artifacts, and each passage the inventory lists in
          `strategy-file-classification.md`, `strategy-configurability-architecture.md`,
          `strategy-workflow-authoring.md`, or another shipped strategy.
        - `pr-lifecycle.test.ts` reads `strategy-configurability-architecture.md`, and `review-fix-release.test.ts`
          reads `strategy-workflow-authoring.md`: each assertion moves with its text.

    - `[ ]` **3.6.b `TECHNICAL-OVERVIEW.md` and the root `README.md`**
        - `TECHNICAL-OVERVIEW.md` § Cross-Machine User State, and the root `README.md`'s Git-notes portability, say
          where personal state is kept and how it syncs. `pr-lifecycle.test.ts` reads `TECHNICAL-OVERVIEW.md`.

    - `[ ]` **3.6.c The two configuration comments, in both copies of `arc-config.yml`**
        - `storage.backing_repository`: the key names a separate repository to keep ARC state in, empty names none, and
          it is read when a destination is chosen (`composeRefStorePorts`), so setting or clearing it moves nothing. It
          names no command and points to `strategy-state-storage.md` for how a clone publishes or moves what it has.
        - `branch.protection`: drop backlog capture committing to the base branch.
        - Targeted edits: afterwards, `diff` of the two copies shows only this project's overrides.

    - `[ ]` **3.6.d `template-contributing.md`, in both copies**
        - "ownership of tracked state" becomes "ownership of project state", as the contributor brief says.

### `[ ]` **3.7 `arc join`'s message says where personal context lives — § 1**

- _Goal:_ After `arc join` where state is kept off the branch, the message says personal context lives under the
  identity's folder, is stored rather than carried by commits, and is published and fetched by `arc sync` only when a
  state remote is designated, so it holds for a local-only store, and still says that session-init reads a work unit's
  session context from its meta.

    - `buildPostJoinMessage` (`src/commands/join.ts`) changes the paragraph it prints when `stateOffBranch` holds. The
      paragraph for state kept on the branch, which describes Git notes, stays while that backend ships.
    - The cases for the changed paragraph change with it: in `unit/join.test.ts`, the off-branch identity case, and in
      `e2e/join-storage-guidance.e2e.test.ts`, the ref-backed join, which still finds no Git notes, still names the
      store, `arc sync`, session-init, and the meta, and now asserts that publishing and fetching both depend on a
      designated state remote. The in-repo cases stay, and an identity-less join still prints none.
    - Run both type checks.

## **Phase 4:** The ADR records

_Purpose:_ Give every row of the specification's table, and every row the closing read added, its record, then accept
the Errand ADR the superseded clauses cite.

_Design decisions:_ Each record follows § 4's four rules, its words written from the landed code: a superseded clause
gets a Status line naming it and its superseding record, as ADR-012's does, and a dated amendment saying what to read
instead; a false mechanism under a standing decision gets a dated amendment; the original text stays as written. The
table settles which record replaces which clause; the notes' § Closing read adds rows to it.

### `[ ]` **4.1 The session, user-state, configuration, and interlock records — § 4**

- _Goal:_ ADR-002, 003, 007, 008, 009, 012, 016, 017, and 018 each say which of their clauses the store replaced and
  what decides in their place.

    - `[ ]` **4.1.a ADR-002 and ADR-003**
        - The table's rule 2 rows: ADR-002's 2026-06-29 "tracked state", and ADR-003 Part 1's configuration sample.

    - `[ ]` **4.1.b ADR-007, ADR-008, and ADR-009**
        - The rule 1 rows against ADR-035's items, and ADR-009's rule 2 row on why larger teams need an external tracker.

    - `[ ]` **4.1.c ADR-012**
        - The rule 1 rows for Parts 1, 2, and 4, Part 2's commit footer against the Errand ADR's statements 2 and 6, and
          Part 3's later amendments, the 2026-04-25 worktree channel standing; and the rule 2 row for the identity key
          and `SESSION-NOTES.md`.

    - `[ ]` **4.1.d ADR-016, ADR-017, and ADR-018**
        - ADR-016's rule 1 row against ADR-035 items 3, 2 as amended 2026-11-17, and 8, and its rule 2 row; the rule 2
          rows of ADR-017 and ADR-018.

### `[ ]` **4.2 The work-unit, Errand, and lifecycle records — § 4**

- _Goal:_ ADR-019, 021, 022, 024, 026, and 027 each say which of their clauses the store or the Errand ADR replaced and
  what decides in their place.

    - `[ ]` **4.2.a ADR-019**
        - The rule 1 rows for Surfaces 1–3 and the work unit's definition, against ADR-035 items 3, 6, 7, and 10 as
          amended, and the rule 2 row for the capture list.

    - `[ ]` **4.2.b ADR-021**
        - The rule 1 rows for its Decision and amendments against the Errand ADR's statements 1–4 and 6, and for the 1:1
          relaxation and the concurrency oracle against ADR-035; the rule 2 row for the lighter merge gate's lane half.
        - Its "recommended recipe" consequence is left to the recipe's removal (spec § 5). Where the tracked-state
          removal has landed first, check whether ADR-021 records the consequence's retirement. If it does, add no
          record and record that it does. If it does not, stop for the Owner, as spec § 5 says of an item no removal
          has taken, and add no record in its place.

    - `[ ]` **4.2.c ADR-022 and ADR-024**
        - Their rule 2 rows, and ADR-024's rule 1 row for the work unit's definition.

    - `[ ]` **4.2.d ADR-026 and ADR-027**
        - Their rule 1 rows, ADR-027's against the Errand ADR's statements 1–3 and 6 and ADR-035 item 7 as amended, and
          their rule 2 rows.

### `[ ]` **4.3 The concurrency, review, locus, and storage records — § 4**

- _Goal:_ ADR-025, 029, 031, 033, and 035 say what the store and the history policy decide now, and ADR-035 carries its
  own amendments to items 7, 9, and 10.

    - `[ ]` **4.3.a ADR-025, ADR-029, and ADR-031**
        - ADR-025's Status note and ADR-035 item 9: append-only holds until `history.policy` can be configured. The two
          lane phrases of ADR-029 and ADR-031.

    - `[ ]` **4.3.b ADR-033**
        - The rule 1 rows against ADR-035 item 6 and the Errand ADR's statements 1 and 5, and the rule 2 row, written
          from `FAMILY_REGISTRY`, `readBasis`, and `prepareMutation`.

    - `[ ]` **4.3.c ADR-035 items 7 and 10**
        - Dated amendments to their 2026-09-29 amendments, written from `workUnitRights`, `mayRemoveEntry`,
          `clashRepair`, `occupyStoreGraduation`, `promotionMeta`, and `runStoreDeactivate`.

### `[ ]` **4.4 The closing read's other rows recorded and the Errand ADR accepted — § 3, § 4**

- _Goal:_ Every row of the closing read has its record, and the Errand ADR reads `Accepted`, every Status line that
  cites it naming its number.

    - `[ ]` **4.4.a The rows outside the table**
        - Each ADR the closing read marked beyond the table, by the same rules.

    - `[ ]` **4.4.b Accept the Errand ADR**
        - Its number is still free at this head, each statement and behavior still holds in source, and its Status reads
          `Accepted (YYYY-MM-DD)`, dated the day of the change.

## **Phase 5:** The project's own strategies, the citations, and the saves at landing

_Purpose:_ Cut the storage check-doc to what still points forward, re-point what cited the rest, prepare the saves the
store takes at landing, and prove that nothing in scope is left.

_Exit criterion:_ At the final head, both parts of the inventory leave no unexplained hit, every row of the closing read
has its record or its reason, no tracked citation names check-doc text that was removed or moved, every heading shipped
text points at exists, and both totals match the recipe.

### `[ ]` **5.1 The storage check-doc cut and Principle 4 moved — § 7**

- _Goal:_ `strategy-storage-evolution.md` keeps only what still points forward, the Self-Check and Principles 5–14
  reworded to what the store is, under their numbers, and Principle 4 holds in `strategy-pm-composition-evolution.md`
  § Interim Boundaries.

    - `[ ]` **5.1.a Cut and reword the check-doc**
        - Out: "The Storage Model", "The Contract, Settled", "Sequencing", and Principles 1–3 and 15. Kept, reworded
          from what the cutover must undo to what the store is: the Self-Check and Principles 5–14, numbers unchanged.
        - Its rename notice goes; the file is not renamed. Its header, scope, and § Relationship to Other Documents
          match what remains, and its `STRATEGY-INDEX.md` row matches the cut.

    - `[ ]` **5.1.b Move Principle 4**
        - External tools own no work-unit artifact: into `strategy-pm-composition-evolution.md` § Interim Boundaries,
          until external PM composition settles the question.

### `[ ]` **5.2 The tracked citations of removed and moved text re-pointed — § 7**

- _Goal:_ No tracked document cites check-doc text that task 5.1 removed or moved.

    - Search the repository for the check-doc's name and its removed sections and principles. Known: the procedure,
      knowledge, and PM-composition check-docs, ADR-020 and ADR-025, and `research-local-mode.md`.
    - An Accepted ADR's citation follows § 4's rules; a historical citation names the file at a commit that holds the
      cited version, the citing words unchanged. The stored records' citations, archived records' among them, are
      prepared in task 5.4.

### `[ ]` **5.3 The notes strategy's head note and the other project strategies — § 1, § 5**

- _Goal:_ While notes sync still ships, the notes-concurrency strategy opens by saying what refuses once the store is
  imported and that the lock's disciplines still hold, and every other project strategy the inventory lists reads true.

    - `[ ]` **5.3.a The head note**
        - At the head of `strategy-user-notes-concurrency.md`: notes writes, loads, and publication, a forced push among
          them, refuse once the store is imported, and the lock's disciplines still hold, as task 1.1 confirmed.
        - Where the notes removal has landed first, check whether it cut the file, with its index row, to the lock's
          disciplines. If it did, add no note and record that it did. If it did not, stop for the Owner, as spec § 5
          says of an item no removal has taken, and add no note in its place.

    - `[ ]` **5.3.b The other project strategies**
        - Each passage the inventory lists in `strategy-testing-methodology.md`, `strategy-procedure-evolution.md`,
          `strategy-knowledge-evolution.md`, `strategy-package-project-sync.md`, or another project strategy, and its
          `STRATEGY-INDEX.md` row where the row describes the old substrate.

### `[ ]` **5.4 The saves at landing prepared — § 5, § 6, § 7, § 8**

- _Goal:_ Every store save this change makes after it merges is written out in the notes with its record, its passage,
  its replacement text, how the record is opened, and the condition it waits on, so the saves after the merge need no
  judgment.

- **Additional Context:** `notes-cutover-documentation.md` § At landing.

- _Note:_ Every save waits for this change's merge: a register row closes only on the merge it attests.

    - `[ ]` **5.4.a The cohort records**
        - `cohort-storage-cutover.md` and the storage cohort's register in `cohort-state-storage.md`: each edit § 8
          lists, against the records as they stand now.
        - § 5's two items: name the removal's unit as owner only where its plan has taken the item, and only while that
          share is outstanding. An item not taken by landing comes back to the Owner then.
        - The append-only row passes to `history-policy` once any passage of its draft that assigns the change
          elsewhere is corrected. Record whether the draft is corrected now; if it is not corrected by the merge, or
          that unit has moved past its draft, the transfer comes to the Owner then, and the row stays as it is.

    - `[ ]` **5.4.b The stored records' citations**
        - Each stored draft that cites removed or moved check-doc text: `framework-core-from-package`,
          `delivery-observe-attest`, `projection-narrowed-views`, `arc-coordination-service`, `external-coord-probe`,
          `external-pm-composition`, and any other the search of the store finds; and `knowledge-architecture`'s
          direction to rename the check-doc, its question about the document family kept.
        - Each archived record the same search finds, such as a completed specification, task list, or notes file,
          that cites removed or moved text: its citation names the file at a commit that holds the cited version, the
          citing words unchanged, as § 7 says of a historical citation.

    - `[ ]` **5.4.c How each record is opened**
        - For each record above, record where it is projected, from the integrating checkout and from the primary
          checkout, and whether it is archived, so the save opens it with `arc edit` first, and that this identity may
          edit it (`workUnitRights`).

    - `[ ]` **5.4.d The held captures**
        - The captures and held Errands in the notes' § Captures in `USER-INBOX` still stand and name their homes.

### `[ ]` **5.5 The inventory, the rows, and the citations exhausted** — validate exit criterion at segment scope

- _Goal:_ At the final head, both parts of the inventory, every closing-read row, every check-doc citation, the headings
  shipped text points at, and both totals hold, against the head verification attests.

    - Re-run the term search and the concept read over the scope at this head, including documents other branches
      changed since task 1.2.
    - Confirm each closing-read row has its record or its reason, and search for links and `§` references into the
      in-scope documents from shipped text, its hooks and skills included, each resolving. Run `lint:arc:links`.
    - Recompute both totals from the recipe at this head, and run `arc check segment`.
    - Before the merge approval, the re-run in `notes-cutover-documentation.md` § At landing covers what differs
      between this head and the tree that merges.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

_Note:_ The last criterion before the quality gates can be seen only once the saves at landing run, after this change
merges. Verification marks it `[~]`, deferred by this recorded decision to the saves `notes-cutover-documentation.md`
§ At landing lists, and leaves the inbox capture and the cohort line that section names. Integration follows that
section from its start. The criterion stays `[~]` in the archived list; the saved records, each closure naming the
merge commit, and their publication are its evidence.

- `[ ]` Neither part of the inventory, the term search or the concept read, leaves an unexplained hit at the final head.

- `[ ]` No shipped strategy tells a reader to commit state, read it through Git, push notes, or hand-render a status
  file.

- `[ ]` `strategy-work-organization.md`, `strategy-concurrent-work.md`, `strategy-session-operations.md`,
  `strategy-planning-module.md`, and `strategy-team-coordination.md` each point to `strategy-state-storage.md`, and a
  project installed from the recipe receives it.

- `[ ]` The Errand ADR reads `Accepted` with its six statements and four behaviors, each checked at the landed head.

- `[ ]` Every sentence the closing read marks has a row or a stated reason in the notes, and every row carries its
  record in its ADR.

- `[ ]` No heading the shipped text points at is missing, no in-scope text links to § Auto-Merge Lane, no workflow
  phrase § 6 names still names the lane, the lock's links resolve, `template-contributing.md` says "ownership of project
  state", and the notes-concurrency strategy opens with § 5's note while notes sync still ships.

- `[ ]` `arc join`'s message and both configuration comments read as § 1 says, and the tests that pin the rewritten
  text pass on it.

- `[ ]` `strategy-storage-evolution.md` holds the Self-Check and Principles 5–14 under their numbers, Principle 4 holds
  in `strategy-pm-composition-evolution.md`, and no tracked citation names text that was removed or moved.

- `[ ]` The Framework total and the installed-files total match the recipe at the final head.

- `[ ]` At landing, the isolation row and the append-only row of the storage-coupling register are closed, the second
  by its transfer to `history-policy`, the doctrine and ADR rows name only what is outstanding, every stored record's
  citation of removed or moved check-doc text is re-pointed, and the saves are published to the state remote.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
