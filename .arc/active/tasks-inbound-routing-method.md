# Task List: Inbound Routing Method

- **Design:** `spec-inbound-routing-method.md`

---

## **Phase 1:** The Errand line as a record test

_Purpose:_ Land D12's record test everywhere the Errand / work-unit floor lives — the canonical method, the strategy
that points at it, and the decision record — so the routing gate's test 2 cites one coherent floor.

_Mode:_ `layer` — closes on the record test settled as the single canonical floor.

_Exit criterion:_ `classify-work-unit` boundary test 1 carries the four questions mapped onto its two axes, the
strategy keeps no copy of the old floor or its create rule, and the new ADR records the reversal.

### `[x]` **1.1 State the record test as `classify-work-unit`'s canonical floor — D12**

- _Goal:_ Boundary test 1 decides Errand versus work unit by four record questions, read on the two axes it already
  names at their sub-floor, with the Owner deciding and the agent proposing.

- _Outcome:_ The four record questions map to scale and derivation; the Owner decides, with unclear cases and promotion
  explicit.

### `[x]` **1.2 Point `strategy-work-organization` at the canonical floor and retire the create rule — D12**

- _Goal:_ The strategy states the Errand / work-unit floor only by pointing at `classify-work-unit` boundary test 1,
  keeps no copy of the old floor, criterion 3, or the create rule, and states making a stub as a transient act.

    - `[x]` **1.2.a Point § The boundary tests and § Work Character at test 1**
        - The boundary and character sections point at the canonical record test; atomic character stays distinct.

    - `[x]` **1.2.b Read the rename worked example against question 1**
        - The rename example clears question 1 because the call sites cannot be named before mapping.

    - `[x]` **1.2.c Point § Errand Work Class's definitions and character layer at test 1**
        - Both definitions and the universal character layer take their wrapper floor from test 1.

    - `[x]` **1.2.d Reduce § Decision matrix to the maintain row**
        - The matrix keeps maintain only; stub creation is transient and roadmap, ownership, and waiting do not decide
          the floor.

### `[x]` **1.3 Record the record test in a new ADR, with forward pointers on ADR-021 and ADR-027 — D12**

- _Goal:_ An `Accepted` ADR records the record test replacing ADR-027's derivation test and the retirement of
  ADR-021's create rule and threshold criterion 3, while both earlier ADRs stay standing and point forward to it.

    - `[x]` **1.3.a Write the ADR at the next free number**
        - ADR-037 records the accepted record test, its alternatives, the retirement, and retained mechanisms.

    - `[x]` **1.3.b Add forward-pointer amendments to ADR-021 and ADR-027**
        - ADR-021 and ADR-027 carry forward-pointer amendments; neither is superseded.

## **Phase 2:** The routing method and the owner's pass

_Purpose:_ Ship `route-discovered-work` whole — gate, homing, integration, re-triage, doors, and binding — wired at
its first door, the owner's planning pass, and prove the gate against a real owner's triage before anything else
builds on it.

_Mode:_ `slice` — closes on the gate reaching a real owner's hand verdicts from rules the method states.

_Exit criterion:_ The blind replay of `quality-gate-hooks`' 30 routed-in entries reaches the hand verdicts recorded at
`2bc91c7a4`, each disposition naming its outcome and deciding test, with test 4 catching the two out-of-scope arrivals.

### `[ ]` **2.1 Ship `route-discovered-work` at the owner's pass — D1, D2, D3, D4, D5, D6, D7, D8, D9**

- _Goal:_ One shipped, overridable method decides disposition, homing, integration, and re-triage through a closed
  outcome vocabulary over a closed door list, keeps every rule about carrying out an outcome in one binding section,
  and is invoked by its first door, the owner's planning pass.

- _Rationale:_ `lint:arc:triggers` fails for a method no workflow declares, and the init and update inventory tests
  check registration together, so the method, its registration, and its first declaring doors land together and 2.1
  is proposed as one review increment.

- _Note:_ The method ships to every project: it names no internal work unit, ADR, storage-program context, or corpus
  figure, and its binding section states only today's binding.

    - `[ ]` **2.1.a Author the contract head**
        - `system/methods/route-discovered-work.md`, in the method-as-function shape `adversarial-review` uses: the
          leading blockquote with the signature `route-discovered-work(entry, door, host?) → per concern, one outcome
          or an Owner-decided pair`, the named-inputs table (`entry`, `door`, `host`), and the typed result (outcome,
          deciding test, `_Shapes:_` for a `fold` or `hold`).
        - The blockquote's `Workflow:` line names the two consumers this task wires, `draft-design.md` and
          `create-spec.md`, and its `When:` line names the point at which each door fires; each later consumer adds
          itself.
        - `.override` and `.default` sections; frontmatter `name`, `description`, `arc.methods` and `related:` naming
          `classify-work-unit`, and `override-active: false`.
        - State "decides only": callers execute outcomes through verbs after their own interlock; the target's
          lifecycle position, owner, and horizon advisory come from `arc status`, its design from `arc view`.

    - `[ ]` **2.1.b Write the gate and homing**
        - The charter: disposition → homing → integration → re-triage, one disposition for every destination.
        - The same-concern pull-in when a work unit starts planning or activates, by the anti-rider concern-identity
          test, taking no routing outcome.
        - Tests 1–4 in order: still live (dismiss naming what resolved it; a partly resolved entry splits),
          Errand-shaped by `classify-work-unit` test 1 (load-bearing infrastructure a review signal, not a floor),
          coupling (`_Shapes:_ <decision or section>`), and scope boundary (Out of scope, Won't Do, Non-Goals).
        - The no-home fall-through to `new-stub` — at the drain a `provisional` one unless the Owner commits at the
          interlock — or `capture` on the fast path without the commitment, and the horizon advisory shown at the
          door's Owner stop from the listing row, never evaluated by the method.
        - Homing: shortlist from `WU_Target` and the listing's purpose rows; at most three finalists read with
          `arc view design --for <slug>`, headings first, then Purpose, scope boundary, and the named section; the
          routed-into target's held count and oldest date; delegated reads under § Sub-agent scope, advisory until
          the primary reads the named section, with nothing primary-side — the door or its allowed outcomes — handed
          to the reader.

    - `[ ]` **2.1.c Write integration, re-triage, and the cascade rule**
        - `fold` and `hold` with their door defaults; a started work unit takes no woven note from anyone but its
          owner; an inbound entry carries `routed from <origin>, <date>` and `_Shapes:_`.
        - Re-triage as the gate run with `host` as the incumbent candidate.
        - The owner's pass: every outcome but `hold <host>` at the pass that makes the draft ready, and where it runs
          (readiness exit, create-spec entry check).
        - The dispositions table the pass leaves in the draft: a row for each entry whose disposition no other record
          keeps, naming the entry and its outcome, where a `fold` landed, and why an entry was rejected or dismissed.
          Review of the draft reads it; the readiness check confirms only that no entry remains held; it is retired
          with the draft at `create-spec`.
        - The drain's re-triage: rights (backlog stubs only), trigger (an offer at the confirmation interlock),
          bounded outcomes, and its record kept in the routing plan, never the target's draft.
        - The cascade rule for work-unit cascades: route a cascade item only when it names the decision it shapes.

    - `[ ]` **2.1.d Write the vocabulary, the doors, and the fast path's judgments**
        - The closed seven-outcome table; one concern, one outcome (split by concern first); each door's Owner stop;
          the Owner-decided pair where the Errand line is unclear, `capture` at the cascade door.
        - The closed door list with each door's allowed outcomes, and the outside-the-door fallback (a disallowed
          `fold` becomes `hold` on the same work unit; a held entry stays `hold <host>`). A hold names one work unit,
          never a group of owners.
        - Any other caller takes one of the listed doors, and a new door is a change to the list: a sweep run when a
          work unit starts planning or activates pulls in its own change's concern without the gate, takes the
          owner's-pass door for anything else it would bring in, and follows the binding's writer line for a sibling
          stub.
        - Gate-before-mint, and the judgments a minted stub may not invent — commitment, priority, `Class` from
          `classify-work-unit`, a legible slug, origin, dependencies — with the `arc stub` options that carry the
          first five (`name`, `--commitment`, `--priority`, `--class`, `--origin`) and dependencies written into the
          minted meta's `Depends On` line, which `arc stub` has no option for; and the design carrying the concern
          and a one-sentence Purpose.

    - `[ ]` **2.1.e Write the binding section**
        - One section carrying every rule about carrying out an outcome on today's substrate: the buffer section as
          the inbound entries, owner adoption and its transit reading, the writer line, the dispositions table's rows,
          the drain's writes (a count shown, never compared), the in-flight new home (by `owner` from `arc status`),
          route-now's vehicles (route-only Errand with its pre-write re-check, pre-routed capture, the
          `primary-occupied` case), the cascade's vehicles, a minted stub's `draft-*` (written beside the meta by the
          minting change and named through `arc stub --design`, which records only the reference), the named gap with
          its Owner-confirmed wait, and that the Owner stops — not enforcement — hold the writer line.
        - The body and the door list name outcomes and who may choose them, and point here for the rest.

    - `[ ]` **2.1.f Register and cross-reference the method**
        - `init-recipe.json` `include_files`, `CONFIGURABLE_FILES` in `src/lib/classification.ts`, the self-hosting
          manifest, the init, update, framework-sync, and E2E install inventories, the unit init test's file and
          classification checks, and `strategy-package-project-sync.md`'s inventory with Configurable and
          installed-file counts matching the recipe.
        - `system/methods/README.md` § Related Methods: a `route-discovered-work` row (`classify-work-unit`) and the
          reciprocal entry on `classify-work-unit`'s row; `classify-work-unit`'s frontmatter, which has no `related:`
          key yet, adds one naming `route-discovered-work`.
        - `strategy-work-organization.md` § Decision matrix: the new-stub sentence names the stub as this method's
          `new-stub` outcome, with a reference-style link to the method.

    - `[ ]` **2.1.g Invoke the method at the owner's-pass doors**
        - `draft-design.md`: declare the method in `arc.methods`; at the loop-exit readiness check, a not-ready gap
          for inbound entries not yet integrated resolves by a YAML callsite with the owner's-pass door, leaving the
          dispositions table. No step is added.
        - `create-spec.md`: declare the method; the entry check runs it with the owner's-pass door for a draft that
          still holds inbound entries, leaving the dispositions table.
        - Both callsites pass `host` as the work unit whose draft holds the entries, and both run at the pass that
          makes the draft ready.
        - Each consumer shows the result at its Owner stop — the outcome, its `_Shapes:_`, the pair where the result
          carries one, the horizon advisory of a coupled target that carries one, and any wait the binding names; mark
          each fire-point and check it by hand.

### `[ ]` **2.2 Replay `quality-gate-hooks`' routed-in entries blind** — validate exit criterion at segment scope

- _Goal:_ Evidence that an evaluator holding only the method reaches the owner's hand verdicts for
  `quality-gate-hooks`' 30 routed-in entries.

- **Additional Context:** `notes-inbound-routing-method.md` § Evidence counts, § Hard-to-place cases from
  `quality-gate-hooks`

    - `[ ]` **2.2.a Build the blind fixture**
        - An exported directory in the scratch area, outside the checkout: `git archive c009ab198` with no `.git`,
          for judging liveness and homes; `quality-gate-hooks`' draft at `7ea9addfa`, carrying the 30 routed-in
          entries; and the method added, with `classify-work-unit.md` and `strategy-work-organization.md` as landed
          here overlaying their archived copies in both the package source and `.arc/`.
        - The archive's `.arc/backlog/planned/inbound-routing-method/` directory, this work unit's own early framing,
          is removed from the export.
        - Nothing else enters it: not that draft's § Buffer triage in any version that carries it, from `d229217cf`
          on, nor this task's Additional Context, nor any author conclusion about the expected verdicts.

    - `[ ]` **2.2.b Run the replay with a fresh evaluator**
        - A fresh subagent per DEV-RULES.ARC § Sub-agent scope, confined to the fixture directory. It runs each entry
          with `door` the owner's planning pass, at the pass that makes the draft ready, and `host`
          `quality-gate-hooks`, reading candidate designs from the fixture tree in place of the method's CLI reads.
        - It returns, per concern, the outcome, the deciding test, and any `_Shapes:_`, and lists every file it read;
          a read outside the fixture is reported as exposure.

    - `[ ]` **2.2.c Compare against the hand verdicts at `2bc91c7a4`**
        - A split verdict counts as one outcome per part, a two-option verdict as either option; every disposition
          names its outcome and test, and no judgment rests on a rule the method leaves unnamed.
        - Test 4 catches the two entries that arrived after the target's out of scope had handed their subject to
          `knowledge-lint`.
        - A mismatch traced to a method rule is corrective work for a revision parent, never fixed inside this task.

## **Phase 3:** Purpose and owner in `arc status`

_Purpose:_ Make each work unit's purpose, owner, lifecycle position, and horizon advisory typed CLI reads, so
homing's shortlist is computed from one listing rather than grepped.

_Mode:_ `layer` through Phase 4 — closes on the complete set of CLI reads homing depends on.

### `[ ]` **3.1 Derive a work unit's purpose from its `Design` artifact — D11**

- _Goal:_ One read returns the first sentence of the `**Purpose:**` field — a `- **Purpose:**` list item or a bare
  `**Purpose:**` line — in the artifact a meta's `Design` names, the first listed that has one, taken from the
  record's own source (the checkout for a checkout-read meta, the selected ref for an in-flight one), and `null`
  whenever no readable Purpose exists.

- _Approach:_ Keep extraction pure over the field text and resolve from the record's `source`: read the meta at
  `source.path` — a checkout path through the injected `fs`, or `<ref>:<metaPath>` for an `in-flight-meta` record —
  parse its `Design` list with the meta parser, and read the artifact beside it from the same source. Never follow
  `InFlightWorkUnit.design`, which joins the list for display. The per-slug and listing paths share this one read.
  Its `<ref>:<path>` read and its `Design`-list selection each take their reader from the caller, so `arc view`
  reuses both (Tasks 4.2 and 4.3). The caller binds the `<ref>:<path>` read to `readGitBlobEntry`
  (`src/lib/io-context.ts`) with `objectAccess: "local-only"`, so Git never fetches a missing object; an absent entry,
  or one whose mode is not a regular file's (`100644` / `100755`), reads as absent. The store's `readFileAt` is not a
  candidate: the `store-production` import rule (`eslint/architecture-imports.ts`) keeps `src/lib/store/in-repo/`
  private to `src/lib/store/`.

    - Build `test-first` (one behavior at a time):
        - a `- **Purpose:**` list item and a bare `**Purpose:**` line both return their first sentence; a `## Purpose`
          heading returns `null`
        - wrapped Purpose lines join with single spaces
        - the first sentence ends at the first `.`, `?`, or `!` outside a backtick code span that is followed by
          whitespace or the field's end
        - a period inside a code span does not end the sentence
        - a single sentence with no terminator returns the whole field
        - a drafted work unit and an `outline`- or `detailed`-specced one return their purpose
        - a `Design` list of two artifacts returns the first listed one's Purpose, or the second's when the first has
          none
        - a `brief` spec (no Purpose field) returns `null`
        - an empty Purpose field, or the template's `—` placeholder, returns `null`
        - `Design: [none]`, a missing artifact, or an unreadable one returns `null`
        - an entry at the ref that is not a regular file returns `null`
        - an in-flight work unit's artifact is read from its selected ref, not the checkout
        - a record with no meta file of its own returns `null`, and an archived work unit whose meta and artifact are
          present returns its purpose

### `[ ]` **3.2 Report `purpose` and `owner` on `arc status <slug>` — D11**

- _Goal:_ `arc status <slug> --json` carries `purpose` (string or `null`) and `owner` (the meta's `Owner` or `null`),
  and the human output shows a purpose line when one is present, with no existing field changing meaning.

    - In `handleLifecycleStatus` and `formatSlugStateQuery` (`src/handlers/status/lifecycle.ts`), take `owner` from
      `recordsBySlug.get(slug).selected` and `purpose` from the purpose read over that record.
    - Build `test-first` (one behavior at a time):
        - a drafted or specced work unit reports its purpose; a meta-only stub reports `null`
        - `owner` is present when the meta names one and `null` otherwise
        - a slug with no record reports both as `null`
        - an in-flight work unit's purpose comes from its selected ref
        - the human output carries a purpose line only when the value is present
        - every existing JSON field keeps its value and meaning

### `[ ]` **3.3 Add purpose, owner, lifecycle, and horizon advisory to the listing's `facts` rows — D2, D11**

- _Goal:_ Each `arc status --project --json` `facts` row carries `purpose`, `owner`, the per-slug lifecycle `state`
  and `position`, and `horizonAdvisory`, so homing reads every candidate at once, while the rendered project view
  stays byte-for-byte unchanged.

- _Note:_ `resolveOracleCandidates` in `src/lib/status/project-view.ts` holds that file's recorded complexity and
  function-length violations; keep the purpose read out of it, in a sibling module.

    - `[ ]` **3.3.a Resolve purpose into the record set before composition**
        - Read purpose as its own pass over the resolved records in the shared resolver path
          (`resolveProjectReadinessViewInput`), through the injected `fs` so the staged index render reads it from the
          index, keeping `composeProjectReadinessViewResult` pure.
        - The pass runs only when the caller asks, through an option off by default: `arc status --project`
          (`src/handlers/status/views.ts`) sets it, and so does its `--staged` path, through
          `renderRoadmapFromIndexViewResult` and `createIndexProjectViewFs`. Every markdown-only caller — the ROADMAP
          assert, the ROADMAP conflict auto-remedy, the tracked-view render, rename, decomposition planning, the
          executor context — leaves it off.
        - Build `test-first` (one behavior at a time):
            - `arc status --project --staged --json` rows carry purpose read from the index, not the worktree
            - a markdown-only render performs no purpose read

    - `[ ]` **3.3.b Extend the `facts` rows with purpose, owner, state, and position**
        - `ProjectReadinessFact` and `factsFor` gain `purpose` and `owner`, and `state` and `position` as
          `resolveSlugQuery` derives them over the composer's lifecycle index — not the record's meta `state`.
        - Build `test-first` (one behavior at a time):
            - a row's `state` and `position` distinguish a started work unit from a backlog stub, and provisional
              from planned
            - `purpose`, `owner`, `state`, and `position` match what the per-slug read reports for the same work unit
            - the rendered markdown and the ROADMAP regeneration output are unchanged

    - `[ ]` **3.3.c Compose `horizonAdvisory`**
        - One CLI-composed line for a provisional work unit, a planned P3 one, or a parked one at any priority: it
          names the target and its horizon, says an entry routed there waits for it, and asks whether to raise its
          priority — for a parked one, to resume it — or send a separable part now.
        - Build `test-first` (one behavior at a time):
            - a provisional work unit carries the advisory
            - a P3 planned work unit carries the advisory
            - a parked P1 work unit carries the advisory, asking whether to resume it
            - a planned P1 or P2 work unit carries `null`
            - an unparked started or a completed P3 work unit carries `null`

### `[ ]` **3.4 Open every Purpose template with a one-sentence thesis — D11**

- _Goal:_ Every design-artifact template that carries a Purpose field — the draft and the three spec forms — tells its
  author to open with a one-sentence thesis, so the purpose read returns a whole thought.

    - `template-draft.md`: the Purpose guidance says it opens with a one-sentence thesis.
    - `template-spec-outline.md` and `template-spec-detailed-rfc.md`: the Purpose placeholder says the summary opens
      with a one-sentence thesis.
    - `template-spec-detailed-prd.md`: "Single sentence preferred" becomes "opens with a one-sentence thesis".

## **Phase 4:** The live design in `arc view`

_Purpose:_ Make `arc view --for` read a started work unit's current copy, and add the `design` kind homing reads a
finalist through.

_Exit criterion:_ Homing's reads are all typed: `arc status` reports purpose and owner per slug, the listing's `facts`
rows carry purpose, owner, lifecycle state and position, and the horizon advisory, and `arc view design --for <slug>`
run from a base-branch checkout reads a started work unit's current copy, whose branch this clone holds, never the
base branch's backlog copy.

### `[ ]` **4.1 Resolve `arc view --for` through the composed lifecycle — D11**

- _Goal:_ `arc view <kind> --for <slug>` resolves the slug through the lifecycle composition `arc status <slug>`
  reads, so a work unit started elsewhere whose branch this clone holds resolves to its started record — located in
  its registered checkout, or at its selected ref when it has none — rather than the backlog copy the base branch
  kept.

- _Note:_ The started-work-unit arm — this target and Task 4.2's reads — branches on whether state lives off the
  checkout's branch, which the storage cutover deletes; keep it in one module so its removal is one edit.

    - Move `handleLifecycleStatus`'s composition call (`src/handlers/status/lifecycle.ts`) — local acquisition,
      `branch.base`, and the transient Errand indexes — into one helper beside `resolveComposedLifecycleIndex` in
      `src/lib/work-unit/composed-lifecycle-index.ts`, taking the identity, the acquisition policy, and its `exec` and
      `fs` from its caller; `arc view` passes `local`, as `arc status <slug>` does without `--fetch`, so it reads the
      refs this clone holds. `arc status <slug>`, `createViewDependencies`' `resolveExplicitTarget`
      (`src/handlers/view.ts`), and `composedMetas` (`src/lib/store/in-repo/meta.ts`), which makes the same local call
      for the store, all call it, so the composition lives in one place; the view's `buildLifecycleIndex` call goes.
    - A record selected from the checkout keeps `resolveExplicitViewTarget`'s classification and signature, fed the
      composed `index`: `store-lifecycle-index.test.ts` and `store-lifecycle-consumers-differential.test.ts` call it
      as their legacy reader. A record whose `selected.source.kind` is `in-flight-meta` goes to one function that
      locates the started target — its `worktreePathBySlug` checkout, otherwise the `<ref>` of its `<ref>:<metaPath>`
      source — and reads the meta there for the task-list pointer.
    - `ResolvedViewTarget` (`src/lib/view/types.ts`) carries that location, so the work unit's artifact paths resolve
      against the target's checkout rather than `options.cwd`.
    - A slug the composition marks indeterminate (`isComposedLifecycleSlugIndeterminate`) is unavailable, with the
      composition's warning for it, rather than resolved to the base branch's copy.
    - Build `test-first` (one behavior at a time):
        - a work unit started elsewhere resolves as started: in its registered checkout when one exists, otherwise at
          its selected ref
        - a backlog stub still resolves to its backlog placement in this checkout
        - a completed work unit still refuses, and an unknown slug is still unavailable
        - an indeterminate slug is unavailable, never its backlog copy
        - `arc status <slug>` output is unchanged through the shared helper

### `[ ]` **4.2 Read a started work unit's artifact from its registered checkout or selected ref — D11**

- _Goal:_ Rendering, `--path`, and `--editor` select one copy of a started work unit's artifact — its registered
  checkout's file, uncommitted edits included, otherwise its selected ref — and `--path` and `--editor` refuse,
  naming the work unit and its ref, when no registered checkout exists.

- _Note:_ `runView` (`src/commands/view/run.ts`) holds that file's recorded complexity violation, which the gate
  cannot see grow; give the copy selection to helpers so `runView` gains no branch.

    - `[ ]` **4.2.a Read the work unit's kinds from the target's location**
        - `meta`, `tasks`, `spec`, `draft`, `notes`, and the meta read behind `cohort` follow the target's location.
          The cohort document still resolves in this checkout, and `session-notes` keeps its checkout-local read,
          since no branch carries it.
        - In a registered checkout these are real files. At a ref, existence and content come from Task 3.1's
          `<ref>:<path>` read, which `ViewArtifactDependencies` gains beside `pathExists`; `presentOrAbsent`,
          `resolveTaskPath`, and `resolveFurthestPresent` use it for a ref target.
        - A ref-read `ViewArtifactResult` carries the content, the ref, and a `<ref>:<path>` display label in place of
          a file path.
        - Build `test-first` (one behavior at a time):
            - from a base-branch checkout, a started work unit renders its selected ref's copy, not the backlog copy
            - a registered checkout's file is read, uncommitted edit included
            - with no kind, the fallback order finds the artifacts at the ref
            - `cohort` follows the started work unit's meta, and `session-notes` still reads this checkout

    - `[ ]` **4.2.b Route each destination through the selected copy**
        - Rendering reads the result's content or file and labels the pager with its display label; `--path` and
          `--editor` name the registered checkout's file.
        - For a ref-read result, `--path` and `--editor` refuse, naming the work unit and its ref, and point at
          rendering as the way to read it.
        - The help text for `--for`, `--path`, and `--editor` describes the copy selection, that it reads the refs
          this clone holds, and the refusal.
        - Build `test-first` (one behavior at a time):
            - `--path` names the same registered-checkout file that rendering reads
            - `--path` and `--editor` refuse for a work unit with no registered checkout, naming it and its ref

    - `[ ]` **4.2.c Prove the selection end to end**
        - `__tests__/e2e/view.e2e.test.ts` gains a case run from a base-branch checkout that keeps the backlog copy,
          with the work unit started on a branch whose spec differs. With a linked worktree holding an uncommitted
          edit, rendering and `--path` read that file; with none, the branch's copy renders and `--path` refuses.

### `[ ]` **4.3 Add the `design` view kind — D11**

- _Goal:_ `arc view design` renders the artifact the meta's `Design` names — the one the purpose read follows, or the
  first listed that exists when none has a Purpose field — from the same copy as the other kinds.

- _Note:_ `resolveExactKind` (`src/lib/view-artifact.ts`) sits at the complexity limit beside the file's recorded
  `resolveViewArtifactUnchecked` violation; move the work-unit artifact kinds into one helper rather than add a case.

- _Note:_ `design` selects from `Design`; it is not an artifact kind and never enters `WorkUnitArtifactKindSchema`
  (`src/lib/layout/schema.ts`).

    - `VIEW_KINDS` (`src/lib/view/types.ts`) gains `design` after `meta`, keeping the `tasks, spec, draft, meta` run
      the unknown-kind case in `view.e2e.test.ts` asserts; the `[kind]` argument help in `src/cli.ts` lists it.
    - The kind parses the meta's `Design` list with the meta parser, resolves each entry beside the meta as
      `resolveTaskListPath` resolves the task list, and picks through Task 3.1's `Design`-list selection over the
      target's reader, falling back to the first listed artifact that exists.
    - Build `test-first` (one behavior at a time):
        - a drafted work unit's `design` resolves to its draft
        - a specced work unit's `design` resolves to its spec
        - a layered PRD and RFC `Design` resolves to the PRD
        - a `brief`-specced work unit, whose spec has no Purpose field, resolves to that spec
        - `Design: [none]`, or a `Design` naming only missing artifacts, reports `design` as not present
        - `spec --for` and `design --for` read the same copy of a started work unit

### `[ ]` **4.4 State the selection in `QUICK-REFERENCE` § Artifact Viewing — D11**

- _Goal:_ `QUICK-REFERENCE` § Artifact Viewing states the started-work-unit copy selection over the refs this clone
  holds, the `--path` / `--editor` refusal, and the `design` kind, matching the CLI.

    - Edit `reference/QUICK-REFERENCE.template.md` in the package source and the § Artifact Viewing section of
      `.arc/reference/QUICK-REFERENCE.md` separately; never copy between them. The project copy keeps its `npx arc`
      invocations.
    - Replace the sentence saying kind and `--for` selection stay the same with the copy selection and the `design`
      kind; say that a start whose branch this clone has never fetched reads as its backlog copy until a fetch brings
      the ref in.

## **Phase 5:** The drain door and the capture surfaces' home

_Purpose:_ Route every capture the drain takes through the method, and sharpen "home" where the always-loaded rule
and the inbox strategies state it.

_Mode:_ `slice` — closes on a drain whose routing plan the gate decides.

_Exit criterion:_ A classification-only drain run over the seeded `USER-INBOX` yields a routing plan in which every
`hold <wu>` names an existing section of its target, none matches the target's exclusions, a hold into a provisional
or planned P3 target shows its horizon advisory, each routed-into backlog stub holding entries carries its count,
oldest date, and re-triage offer, a picked stub's re-triage takes only the re-triage door's outcomes, and an unclear
Errand line shows the pair.

### `[ ]` **5.1 Route the drain's captures and re-triage through the method — D2, D4, D5, D8, D9**

- _Goal:_ The drain classifies every capture through the method with the drain doors, confirms a routing plan that
  shows each concern's outcome, `_Shapes:_`, horizon advisory, any Owner-decided pair or named wait, and a re-triage
  offer per routed-into backlog stub holding entries, re-triages the stubs the Owner picks, and writes only what the
  binding allows.

- _Note:_ `review-gate-workflows.test.ts` requires the package and project copies to match and pins § 5's
  full-protection write mechanics, and `locus-methodology-contracts.test.ts` pins § 6's batch command; leave both.

    - `[ ]` **5.1.a Declare the method and mark its fire-points**
        - `supplemental/drain-inbox.md` gains an `arc:` frontmatter block declaring `route-discovered-work` and
          `assess-parallel-fit`, which § 2's overlap read already fires through an in-step link; `classify-work-unit`
          stays undeclared, since the method's test 2 fires it, not the drain. § 2 carries a YAML callsite and
          fire-point marker for each drain door.
        - The method's blockquote `Workflow:` line gains `drain-inbox.md`.

    - `[ ]` **5.1.b Classify through the gate in § 2**
        - Verify-before-routing becomes the gate's test 1; the Character and scope re-triage bullets defer to the
          gate's test 2 and drop load-bearing infrastructure as a floor; the Home rule becomes the coupling and
          scope-boundary tests with homing.
        - In-flight target adoption runs after the gate: `WU_Target` is the gate's first candidate, owner adoption
          carries only a gated `hold` into a started work unit, and the user override of that default goes.
        - Grouping, commitment, the execute-now bias, and the atomic disposition apply to the method's outcomes:
          grouping consolidates `new-stub` outcomes that share one concern, and an `errand` outcome takes the atomic
          disposition — execute-now, defer by the homeless-atomic route, or retain.

    - `[ ]` **5.1.c Make § 3's routing plan the drain door's Owner stop**
        - The plan shows each concern's outcome, the `_Shapes:_` of each `fold` or `hold`, the horizon advisory of a
          held-into target whose listing row carries one, any Owner-decided pair, and any wait the binding names.
        - Each routed-into backlog stub that already holds entries gets one line: its held count, the oldest entry's
          date, and an offer to re-triage it this sweep.
        - Picking a stub returns its held entries to § 2 for re-triage, and the revised plan is presented at this
          same stop before any write.

    - `[ ]` **5.1.d Defer § 5's integration modes to the method**
        - The Existing-stub home bullet's head names a backlog stub's `draft-*`, in place of "a live `active/` or
          `backlog/` stub" and its `draft-*` / `notes-*`: the drain writes only a backlog stub's draft, and an in-flight
          target takes owner adoption. § 2's destination-path overlap list follows, naming stub drafts in place of
          "stub drafts / notes".
        - The integration modes defer to the method with the drain door's narrower weave — `fold` only for a
          trivially additive, on-topic note into a backlog stub.
        - A held entry carries its `routed from <origin>, <date>` provenance and its `_Shapes:_`.
        - The integration obligation names the owner's pass: the owner folds or dispositions every held entry before
          the draft is ready, at `draft-design`'s readiness exit and `create-spec`'s entry check.
        - The owner-adoption default carries only a gated `hold`, and its override goes; the new-stub route always
          writes the stub's `draft-*`, not only when scope warrants.
        - The homeless-atomic route takes every deferred `errand` outcome, since no Errand-shaped item has a work-unit
          home, in place of "an atomic with no determinable home".

    - `[ ]` **5.1.e Carry out the re-triage of a picked stub**
        - § 2 re-triages a picked stub's held entries through the method's re-triage door, with that stub as `host`.
        - § 5 carries out each outcome in the drain's grooming change: `dismiss` removes the entry; `hold <other>`
          moves it to another backlog stub, or, for a started target, goes as the binding's in-flight new home says;
          `new-stub` mints a stub with its `draft-*`; `errand` takes the homeless-atomic route; `hold <host>` keeps the
          entry or rewrites a split's residual in place.
        - What moved where goes in the grooming PR body under full protection and the commit message under partial,
          never in the target's draft.

### `[ ]` **5.2 Sharpen "home" in `DEV-RULES.ARC`'s core invariant — D10**

- _Goal:_ The always-loaded core invariant makes a stub authoritative for the decisions it owns, defines a home as the
  work unit whose decision an item shapes, gives an Errand-shaped item no home, and points at the method — two
  sentences of growth, the invariant marker and its scope unchanged.

    - Replace the core-invariant paragraph's text in `system/rules/DEV-RULES.ARC.md` § Discovered Work Routing with
      the spec's D10 paragraph, keeping its `**The core invariant.**` lead-in, which § Planning artifacts aren't
      capture surfaces refers to; no other always-loaded surface changes.

### `[ ]` **5.3 Read `WU_Target` as a candidate, and pull in only same-concern items, in the inbox docs — D2, D10**

- _Goal:_ The strategies describing captures read `WU_Target` as a candidate the drain's gate checks, route every
  capture through that gate — Errand-shaped items by the homeless-atomic route — and pull in at activation only what
  the work unit's own change covers; neither they nor the shared inbox's shipped template gives an Errand-shaped item
  a work-unit home.

    - `[ ]` **5.3.a Update `strategy-session-operations.md` § USER-INBOX**
        - A `## Work Unit` entry's `WU_Target` is a candidate the drain's gate checks, not a destination its existence
          decides.
        - The Lifecycle paragraph's "`§ Errand` items to their target stub" becomes the drain's homeless-atomic route,
          and its "`§ Work Unit` items to an existing stub or a new _provisional_ stub" routes them through the
          drain's gate.

    - `[ ]` **5.3.b Update `strategy-planning-module.md`**
        - § `backlog/ATOMIC-INBOX.md` and § Shared-Inbox Write Discipline's "Read at activation" and "Read at
          planning-kickoff": activation and planning kickoff pull in items the work unit's own change covers, by the
          anti-rider concern-identity test, not items whose home turns out to be the work unit or its domain.
        - § `backlog/ATOMIC-INBOX.md`'s "single-step work with no better home than the shared surface" and "flushing
          homeless `USER-INBOX § Errand` items", and § Shared-Inbox Write Discipline's "genuinely homeless `§ Errand`
          items", become every `§ Errand` item, since none has a work-unit home.
        - § How Work Flows Through's "§ Errand items route to their home" becomes the homeless-atomic route, and its
          § Work Unit clause routes through the drain's gate.

    - `[ ]` **5.3.c Update the `ATOMIC-INBOX` template's header**
        - In `backlog/ATOMIC-INBOX.template.md` (package source), "single-step captures with no better home" and "only
          genuinely homeless single-step items rest in this shared surface" become every Errand-class capture, none of
          which has a work-unit home.
        - The project's `.arc/backlog/ATOMIC-INBOX.md` keeps its own header: a scaffolded file is project-owned after
          init, never synced from the template.

### `[ ]` **5.4 Dry-run the drain over the seeded inbox** — validate exit criterion at segment scope

- _Goal:_ Evidence that the updated drain's § 1–§ 3 produce a routing plan meeting the segment's exit criterion over
  the real inbox.

    - `[ ]` **5.4.a Seed the cases the inbox lacks**
        - Where the `USER-INBOX` in hand lacks them, add a capture whose home is a backlog stub that already holds
          entries, a capture whose home is a provisional or planned P3 stub, and a capture whose Errand line is
          unclear; seed a working copy, never the live inbox.

    - `[ ]` **5.4.b Run § 1–§ 3 classification-only**
        - No writes. Check that every `hold <wu>` carries a `_Shapes:_` naming a section present in its target as
          `arc view design --for` renders it, that none matches the target's stated exclusions, that a hold into a
          provisional or planned P3 target shows its horizon advisory, that each routed-into backlog stub holding
          entries shows its count, oldest date, and offer, and that the unclear case is the pair.
        - Pick one offered stub: its re-triage takes only `dismiss`, `errand`, `hold <other>`, `new-stub`, or
          `hold <host>`, and appears in the revised plan.

## **Phase 6:** The fast path and the Errand doors

_Purpose:_ Give the fast path its door in `arc-inbox`, gate `arc-errand`'s route shape as its pre-flip vehicle, give
`run-errand` its route-to-home door, and wire `run-errand` and `init-work-unit` to the record test.

_Mode:_ `slice` — closes on a route-now that runs the gate before it mints.

_Exit criterion:_ A classification-only route-now run over four constructed concerns routes a coupled concern to its
home with its `_Shapes:_`, returns `new-stub` with every judgment named for a homeless one, `errand` for an
Errand-shaped one, and D9's pair with D12's four answers for an unclear one.

### `[ ]` **6.1 Add `arc-inbox`'s route-now mode and the capture's `_Shapes:_` — D2, D7, D10**

- _Goal:_ `arc-inbox` continues into the method's fast-path door when the session holds the commitment and captures
  only when it does not, and builds Work Unit captures whose `WU_Target` is a candidate and which may carry
  `_Shapes:_`.

    - `[ ]` **6.1.a Route now from step 1**
        - The intro and step 1 no longer say the skill runs only once the call is "capture for later": step 1 asks
          whether the session holds the commitment, captures when it does not, and otherwise continues into a YAML
          callsite of `route-discovered-work` with the fast-path door, with a marked fire-point.
        - The proposal before the route shows the outcome, its `_Shapes:_`, the pair where the result carries one, the
          horizon advisory of a coupled target that carries one, and any wait the binding names.
        - Step 1 carries the hand-off, each route as the method's binding section says: `fold` lands in the session's
          own work unit; an `errand` run now and a now-route outside the session's own work unit go to `arc-errand`;
          a deferred `errand`, a pre-routed capture, and `capture` continue into steps 3–5, taking the section,
          `WU_Target`, and `_Shapes:_` from the gate and skipping step 2's classification. `arc-errand`'s direct gate
          enters the hand-off with the outcome the Owner confirmed there, without running the callsite again.
        - The method's blockquote `When:` line names `arc-inbox`'s route-now mode as the fast-path door.

    - `[ ]` **6.1.b Name the route-now mode in the `description`**
        - The frontmatter `description`, the skill's trigger surface, names the mode so the door is reachable.
        - The skills README's `arc-inbox` line (`system/.internal/skills/README.md`, package source, synced to the
          project copy) follows the new `description`.

    - `[ ]` **6.1.c Recast step 2's infra-smell note**
        - It no longer invites escalating an Errand capture to a Work Unit on a design fork alone, and its second look
          for design hiding checks the capture against `classify-work-unit` test 1; touching load-bearing
          infrastructure stays a review-lane signal.

    - `[ ]` **6.1.d Read `WU_Target` as a candidate in step 3**
        - The `## Work Unit` shape's `WU_Target` is a candidate the drain's gate checks, not a destination its
          existence decides; the descriptors gain `_Shapes:_`.

    - `[ ]` **6.1.e Give no Errand-class capture a home in step 5**
        - Step 5's "homeless errand-class item — one with no determinable home" becomes every Errand-class item, which
          has no work-unit home: it captures to `## Errand` and transits to the shared inbox at the next drain.

### `[ ]` **6.2 Enter `arc-errand`'s route shape only after the gate — D7, D8**

- _Goal:_ `arc-errand`'s route shape writes only backlog stubs, only after the gate — route-now's, or, when invoked
  directly, its own, run before the Errand opens — and only once `run-errand`'s pre-write re-check in the Errand's
  checkout still gives the result the Owner confirmed.

    - `[ ]` **6.2.a Gate the route shape in step 1**
        - The route bullet's destination, "an existing backlog stub or draft", becomes an entry in a backlog stub or a
          minted stub, never a started work unit's draft, written as the method's binding section says.
        - Invoked directly, the route shape runs a YAML callsite of `route-discovered-work` with the fast-path door
          before the Errand opens, with a marked fire-point, and the Owner sees its result there; a result other than
          a now-route goes to `arc-inbox`'s route-now hand-off with the outcome the Owner confirmed, and the hand-off
          carries it without running the gate again.
        - The route bullet says the write follows `run-errand`'s pre-write re-check (Task 6.3.e).
        - The method's blockquote `When:` line names the route shape's gate on a direct invocation.

    - `[ ]` **6.2.b Classify a route-only Errand by its routing change in step 2**
        - Step 2's account of Launch says a route-only Errand is classified by its routing change — writing an entry
          or minting a stub — not by the concern it carries.

### `[ ]` **6.3 Route, re-check, record Decided lines, and promote in `run-errand` — D7, D8, D9, D12**

- _Goal:_ An Errand routes a concern it discovers through the method's Errand route-to-home door, re-checks a
  route-only Errand's route in its own checkout before it writes, records each fork it settles as a `Decided:` line,
  shows the record test's answers at Launch only when one is yes, and promotes the moment an answer flips.

- _Note:_ A `Decided:` line inside the commit's final paragraph breaks the trailer block when it wraps:
  `parseTrailerBlock` (`src/lib/commit-check/parser.ts`) then rejects the paragraph, and no `Context:` trailer is
  found.

    - `[ ]` **6.3.a Declare both methods and invoke the route-to-home door**
        - `supplemental/run-errand.md` declares `route-discovered-work` and `classify-work-unit` in `arc.methods`.
        - In Execute, beside the promote primer, a concern the Errand discovers runs a YAML callsite with the Errand
          route-to-home door, with a marked fire-point. The Errand's proposal before it routes shows the outcome, its
          `_Shapes:_`, the pair where the result carries one, the horizon advisory of a coupled target that carries
          one, and any wait the binding names.
        - Its routes are carried out as the method's binding section says, each capture built with `arc-inbox`'s
          entry shape: `hold <wu>` and `new-stub` become pre-routed captures; `errand` waits as a `§ Errand` capture
          unless the Owner runs it as its own Errand; `capture` is a capture with its home undecided; `dismiss` writes
          nothing.
        - The method's blockquote `Workflow:` line gains `run-errand.md`, and so does `classify-work-unit`'s, whose
          `When:` line gains the Errand's Launch classification and promote trigger.

    - `[ ]` **6.3.b Add the `Decided:` line to the commit and the lean PR body**
        - Each fork the Errand settles is recorded as `Decided: X over Y — because Z` in the lean errand PR body, after
          its Summary, and in the commit body as its own paragraph above the `Context:` trailer; the commit template
          shows that paragraph. A partial-protection Errand has only the commit.

    - `[ ]` **6.3.c Show the four answers at Launch when one is yes**
        - Launch step 1 shows the record test's four answers only when one is yes, for the Owner's call, and
          classifies a route-only Errand by its routing change, not the concern it carries.
        - An in-step `classify-work-unit` link marks the fire-point.

    - `[ ]` **6.3.d Make the promote primer the record test's trigger**
        - Execute's promote primer fires the moment any answer flips, leaving the floor to the Promote Errand path it
          already defers to; the two-floor summaries stay.
        - An in-step `classify-work-unit` link marks the fire-point.

    - `[ ]` **6.3.e Re-check a route-only Errand's route before it writes**
        - For a route-only Errand, Execute runs a YAML callsite of `route-discovered-work` with the fast-path door in
          the Errand's checkout before the write, with a marked fire-point: the coupling and scope tests, and for
          `new-stub` the shortlist, against the base's current copies. A changed result returns to the Owner.
        - The method's blockquote `When:` line names this pre-write re-check.

### `[ ]` **6.4 Map the record test's answers to `--floor` in `init-work-unit`'s Promote Errand path — D12**

- _Goal:_ The Promote Errand path names the floor by the record test's answers — question 1 `scale`, questions 2–4
  `derivation`, `derivation` winning when both flip — as `arc errand promote --floor` takes it.

    - Edit § Promote Errand to Work Unit Path in `work-unit-lifecycle/planning/init-work-unit.md`; its method
      declarations stay unchanged.
    - Step 1 names the floor from the answers that flipped, and the stop before promotion shows them as the floor's
      reason.
    - The partial-protection sentence starts the work unit at the stage the floor names.

### `[ ]` **6.5 Dry-run route-now over four constructed concerns** — validate exit criterion at segment scope

- _Goal:_ Evidence that route-now runs the gate before minting and returns the right outcome for each kind of concern.

    - `[ ]` **6.5.a Construct the four concerns against the live backlog**
        - One that shapes an existing work unit's decision, one spec-worthy concern with no home, one Errand-shaped
          concern, and one whose Errand line is unclear.

    - `[ ]` **6.5.b Run route-now classification-only**
        - No writes and no Errand opened. The coupled concern routes to its home with its `_Shapes:_` instead of
          minting a stub; the homeless one returns `new-stub` with commitment, priority, `Class`, slug, origin, and
          dependencies named; the Errand-shaped one returns `errand`; the unclear one returns the pair with the four
          answers.

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` The blind replay reaches the hand verdicts recorded at `2bc91c7a4` from rules the method states: a split
  verdict as one outcome per part, a two-option verdict as either option, every disposition naming its outcome and
  deciding test, and test 4 catching the two entries that arrived after the target's out of scope excluded them

- `[ ]` The route-now dry run over four constructed concerns returns a home with its `_Shapes:_`, `new-stub` with
  commitment, priority, `Class`, slug, origin, and dependencies named, `errand`, and the pair with the four answers

- `[ ]` The drain dry run's routing plan carries a `_Shapes:_` naming an existing target section on every
  `hold <wu>`, no route into a target's exclusions, the horizon advisory on a hold into a provisional or planned P3
  target, a count, oldest date, and re-triage offer per routed-into backlog stub holding entries, a picked stub's
  re-triage within the re-triage door's outcomes, and the pair for an unclear Errand line

- `[ ]` `arc status <slug> --json` reports `purpose` per the first-sentence rule — `null` for a meta-only stub, a
  `brief` spec, or a missing artifact — and `owner`; each `--project --json` `facts` row carries `purpose`, `owner`,
  the per-slug `state` and `position`, and `horizonAdvisory` (text for a provisional work unit, a planned P3 one, or a
  parked one, `null` otherwise), with an in-flight work unit's purpose read from its selected ref

- `[ ]` From a base-branch checkout, `arc view design --for <slug>` and `arc view spec --for <slug>` read a started
  work unit's registered checkout file, uncommitted edits included, or its selected ref when this clone holds its
  branch, never the backlog copy; `--path` names that file or refuses with the work unit and its ref;
  `QUICK-REFERENCE` § Artifact Viewing states it

- `[ ]` `route-discovered-work.md` ships every section the design names, keeps every carry-out rule inside its one
  binding section, declares and relates `classify-work-unit`, names no internal work unit, ADR, or storage-program
  context, and resolves in every inventory, with the package-sync strategy's counts matching the recipe

- `[ ]` `drain-inbox.md`, `run-errand.md`, `draft-design.md`, and `create-spec.md` each declare the method, invoke it
  at a marked fire-point, and carry their § Ship surface edits; `run-errand.md` also declares `classify-work-unit` and
  re-checks a route-only Errand's route in its own checkout before it writes; `init-work-unit.md`'s Promote Errand path
  maps the four answers to `--floor`; `arc-inbox` and `arc-errand` carry their edits; both inbox strategies and the
  `ATOMIC-INBOX` template's header carry their readings; no consumer restates the gate's tests or the vocabulary

- `[ ]` `classify-work-unit` boundary test 1 carries the four questions on its two axes, and
  `strategy-work-organization.md` points at it from § The boundary tests, § Work Character, and § Errand Work Class,
  keeps no copy of the old floor or criterion 3, keeps the one-row matrix with the `new-stub` sentence, and reads the
  rename example against question 1

- `[ ]` `DEV-RULES.ARC` § Discovered Work Routing carries the new core-invariant paragraph verbatim, and no other
  always-loaded surface changes

- `[ ]` The new ADR is `Accepted` and records the record test and the retirement; ADR-021 and ADR-027 each carry a
  forward-pointer amendment and neither is superseded

- `[ ]` The four templates carry the first-sentence convention

- `[ ]` `lint:arc:triggers` passes, every edited Framework file is identical in both copies, and every commit passes
  `check-package-sync.sh`

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
