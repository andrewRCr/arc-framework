# Task List: session-init-agenda

- **Design:** `spec-session-init-agenda.md`

---

## **Phase 1:** Baseline and the agenda contract

_Purpose:_ Record the done-signal baseline before any shipped text changes, then settle the substrate every later
phase compiles into: the registered agenda schema, the verb with its flags and refusals, the probe composition the
verb shares with `arc status --session-init`, and the precedence order down to the stop rows.

_Mode:_ `layer` — closes on a settled agenda contract and a verb that validates, refuses, and compiles the stop rows.

_Exit criterion:_ The baseline is recorded from an unchanged base; `arc agenda session-init --json` prints an agenda
that validates against `arc schema get session-init-agenda` for the stop rows, refuses every invalid flag combination
with a typed refusal, and leaves the repository as found.

### `[x]` **1.1 Record the done-signal baseline — Success Criteria 1–3**

- _Goal:_ Both parts of the done-signal have a baseline, measured by both instruments on a kit install of the unchanged
  base, before this branch changes any shipped text.

- **Additional Context:** `notes-session-init-agenda.md` § Sizing and measurement

    - `[x]` **1.1.a Build the baseline kit install**
        - Built and packed source `eaf54487d4` with `packages/` unchanged from base `279aa8ebf9`; host memory policy
          allowed the build. Kit run `2026-11-01T145902` used the verified `--source` option. Link fill copied 10
          targets; the install committed with hooks enabled, pushed to its local bare origin, and probed clean on
          `main` with entering row `free-primary` (Orient). Metadata and the probe are retained under
          `~/dev/arc-evidence/session-init-agenda/baseline/`; see `notes-session-init-agenda.md` § Baseline install.

    - `[x]` **1.1.b Run the itemized headless instrument**
        - Retained one-turn Claude Code JSON outputs for all nine installed items and the empty comparator, using
          the prescribed flags. Verified the three input-usage fields: empty input totals 6,564 tokens, net workflow
          input 27,283, and net itemized total 51,801. `measure-items.py` accepts an item manifest for unchanged reuse;
          raw results, frozen inputs, and the summary live under `~/dev/arc-evidence/session-init-agenda/baseline/`.

    - `[x]` **1.1.c Read the real-session instrument and record the baseline**
        - Captured matched real Claude Code `/context` reports after the first response, including that response:
          empty 40.8k, workflow-only 71.1k (net ≈30.3k), and Orient 101.8k (net ≈61k). Controlled transcripts prove
          Orient's first assistant prose is its final summary. Evidence retains raw terminals, full transcripts,
          commands, and the excluded early-prose attempt; the notes record the comparison and its rounded precision.

- _Outcome:_ Both instruments are recorded before any shipped text or implementation changes: itemized baseline
  27,283 workflow tokens and 51,801 total, real-session baseline ≈30.3k workflow tokens and ≈61k Orient tokens.

### `[x]` **1.2 Register the agenda contract — § 3, § 2.3**

- _Goal:_ `arc schema get session-init-agenda` serves the agenda's shape — every step type, choice kind, `then`, nudge
  marker, and orientation shape — and a runtime assertion rejects any agenda that breaks the contract's
  cardinalities.

    - _Amended in:_ 1.R (A1)

    - `[x]` **1.2.a Define the agenda schema**
        - Added strict, described agenda envelope, step, and choice schemas in `commands/agenda/schema.ts`, reusing
          shared paths, read modes, cursor, action, and residual-slot authorities. Read validation couples cursor
          presence to strategic partial mode and requires non-negative integer groups; executable argv is mandatory.

    - `[x]` **1.2.b Assert the cardinalities the shape cannot carry**
        - Added `assertSessionInitAgenda` using the shared envelope assertion boundary and runtime refinements for
          step order, terminal boundaries, read-group ordering, immediate-offer declines, and auto-proceed limits.
          The served shape retains the non-empty steps constraint while runtime validation closes cross-field rules.

    - `[x]` **1.2.c Register the schema id**
        - Registered `session-init-agenda` at version 1 in the session-envelope and production catalogs and their
          pins. The CLI serves the described JSON Schema with closed references to all four residual contracts;
          runtime assertion retains the cross-field refinements omitted from the served shape.

### `[x]` **1.R Preserve literal elicited arguments — A1**

- _Goal:_ Amendment A1's elicited signal reaches option parsing before any end-of-options delimiter, preserving both
  a leading-dash answer and a leading-dash positional seed; the served description agrees with the execution rule.

    - `[x]` **1.R.a Correct the elicitation argument operation**
        - Exposed `appendAgendaOption` from the shared builder, inserting literal values before `--` and binding
          leading-dash values with `=`. Updated the served choice description without changing its fields.

    - `[x]` **1.R.b Revalidate literal elicitation**
        - The detecting Commander-grammar case and leading-dash answers for both signals now preserve the answer and
          positional seed. The same three cases failed against the append-only operation; the served description
          states insertion and literal binding. Closing evidence is in `notes-session-init-agenda.md` § A1.

### `[x]` **1.3 Add the verb with its flags, refusals, and answer carriage — § 2.1, § 2.2, § 4.6**

- _Goal:_ `arc agenda session-init` takes the session's signals and answers as flags, refuses every invalid combination
  with one typed refusal document naming the offending flags, and builds every recompile argv from what it received.

    - `[x]` **1.3.a Register the verb**
        - Registered the lazy `agenda <ceremony> [seed]` adapter, all signal options, and repeatable answer/done
          options. Added strict command-owned input, machine-output and interaction-context declarations, help
          grouping, implementation inventory, and no-input fixture/count pins. The built command terminates through
          the provisional uncompiled-row refusal, and its root help stays within 80 columns.

    - `[x]` **1.3.b Parse signals and refuse invalid combinations**
        - Added pure signal and decision acquisition with typed `{code, flags, row, remedy}` refusals before probing.
          Conflicting intents, named errand-next, orphan isolation, malformed decisions, and contradictory answers
          refuse; exact signal values, final-equals answer parsing, and identical-answer collapse are preserved.
          Native CLI coverage verifies one JSON refusal and corrected input reaching ordinary dispatch.

    - `[x]` **1.3.c Carry answers into every emitted argv**
        - Added the shared literal argv builder and percent-encoded question keys. It retains decisions and intent,
          applies signal changes, clears Errand isolation on decline, and supports dropping next/seed or omitting an
          elicited signal. Leading-dash values and positional seeds round-trip through the registered grammar.

### `[x]` **1.4 Share the session-init probe composition with the verb — § 2.1, § 2.5**

- _Goal:_ The verb and `arc status --session-init` read the same slot values from one composition, and the status
  envelope and its compaction-seed write are unchanged.

- _Outcome:_ Exported `composeSessionInitStatus` in place and reused the already-exported context opener. Status
  retains seed writing, assertion, and rendering in its wrapper; the agenda acquires the same composed slots without
  seed writing. The native adapter now reports its derived entering row. Existing status and seed cases pass unchanged;
  the file and recorded suppression counts remain within their existing bounds.

### `[x]` **1.5 Compile the precedence order and the stop rows — § 2.2, § 2.3, § 2.4, § 4.4**

- _Goal:_ The compiler resolves exactly one row in § 2.2's order, every stop compiles to its `locus` render and a
  `gate stop` with orientation `none`, and the verb prints the asserted agenda without writing anything.

    - `[x]` **1.5.a Define the compiler's inputs and the shared fixtures**
        - Added checkout-bound filesystem/Git reads and the compiler input contract. Extracted the existing probe
          builders into `session-init-fixtures.ts`; its composed fixture runs `runSessionInitStatus` and the public
          envelope assertion. Existing status cases use those shared builders without changing their outcomes.

    - `[x]` **1.5.b Resolve the row**
        - Added the pure precedence resolver: stops, branch recovery, explicit signal, focused recon, then the entering
          row. Contextless work units require non-null husk evidence. Uncompiled arms return a typed refusal naming
          their selected row and the base-workflow or alternate-checkout restart route.
        - _Retired in:_ Phase 4

    - `[x]` **1.5.c Compile the stops and the degraded-slot render**
        - Stops now produce an asserted agenda with orientation `none`, verbatim unavailable guidance or the ready
          locus lines plus the missing-context explanation, and a final stop gate. Only failed `currentHusk` adds a
          diagnostic; no prefix, reads, unrelated failed-slot surfaces, or unused-signal notes run on this path.

    - `[x]` **1.5.d Print the agenda and prove it writes nothing**
        - Wired the shared compiler into the CLI: compact JSON or a readable complete agenda, with typed refusals for
          unfinished arms. Native coverage carries repeated decisions and literal elicited values through the real
          parser. A clean Orient fixture with divergent notes and a remote Errand ref proves both temporary-ref
          families are successfully fetched and deleted; HEAD, refs, worktree status, and personal contents stay equal.
          Git's native trace events provide the proof without changing the existing shell trace harness.

## **Phase 2:** The work-unit resume compile

_Purpose:_ Compile everything a work-unit resume emits: its sync steps and notes load, the answers that carry across
recompiles, its reads and session-notes fields, and its whole orientation — every § 6 surface but branch-gone and
Orient's routes — so the spine that lands next has a complete resume to execute.

_Mode:_ `slice` through Phase 3 — closes on a plain resume driven end to end by the agenda and the spine.

### `[x]` **2.1 Compile the entry prefix's sync steps — § 5.1, § 5.2, § 7.1, § 4.8, § 4.11**

- _Goal:_ A resume's prefix turns each channel's published recommendation into the step § 5.2 assigns — the first
  automatic sync as a recompiling `exec` that ends the agenda, otherwise the ordered `ask: "now"` offers with the
  combined pair, then the user-reference apply — and runs only argv the CLI published or composed from slot fields.

    - `[x]` **2.1.a Compile the worktree, base, and user-reference channels**
        - Added channel-set-aware prefix sequencing and shared recompile constructors. Worktree/base actions use
          literal field-derived argv; reference apply retains its published command and checkout. Automatic notes
          pull/load precedes base sync; available offers stay ordered before apply, and reset remains offer-only.

    - `[x]` **2.1.b Compile the notes channel and load in the cutover module**
        - Isolated notes pull/load steps in `notes.ts`. Pulls suppress co-triggered loads; disk lag and retired
          subdirectories share one load. Policy, the retired dirty-tree prompt, producer text, the compiler's load
          prompt, and failed-config fallback select the step without weakening the independent retired trigger.

    - `[x]` **2.1.c Combine offers**
        - Combined worktree pull with notes pull/load into four-choice offers, preserving the published combined
          prompt or joined channel texts. Each choice carries ordered literal actions and per-key answers under one
          recompile; base and reset offers remain separate.

    - `[x]` **2.1.d Offer the superseded reset**
        - Shared the supersession head between producer prompts and orientation. Pending resets remain offers with
          literal branch-derived argv; dirty prompts add the reset-specific warning. Declined or notes-only rows
          render only the shared head, without duplicating a pending offer.

### `[x]` **2.2 Carry answers across recompiles — § 4.5, § 4.6**

- _Goal:_ Every emitted recompile argv carries the answers and done ids its position implies, and the compiler, given
  them, never asks an answered question, runs a done `exec`, or follows a recorded method fragment again, reporting
  each in an `answered` note and each still-recommended sync in a `sync-unsettled` note.

- _Outcome:_ Added an ordered progress fold for all recompile choices, retaining literal operands while recording
  earlier declines and followed methods. Prefix channels prune recorded decisions before combining or constructing
  steps; shared sync state reports unsettled accepts/runs and supplies per-action unsynced facts to orientation.

### `[x]` **2.3 Compile a resume's reads and session-notes fields — § 4.3, § 4.9, § 5.1, § 5.6**

- _Goal:_ A resume reads the universal set and the rest of its load set in manifest order, in groups under the
  per-group budget, emitting only files that exist and carrying the task cursor, with the Session Type override and
  the freshness note decided by the compiler from SESSION-NOTES itself.

    - `[x]` **2.3.a Compile the reads**
        - Added manifest-order reads with a fixed 48 KiB group budget and isolated oversized documents. Reads retain
          strategic cursor authority and contributor context; missing files, unavailable cursors, absent notes and
          unresolved workflows produce the specified diagnostics or history while absent working memory stays quiet.

    - `[x]` **2.3.b Read the session-notes fields**
        - Added semantic session-field decoding through the storage owner using the shared field grammar. Valid
          overrides reproject the manifest and stages while retaining the global memory path; reserved/invalid
          overrides warn. Freshness resolves abbreviated commits and reports history/meta changes, absent baselines
          and unreachable baselines from current reads.

### `[x]` **2.4 Compile the core orientation and auto-proceed — § 2.3, § 4.10, § 5.1, § 6.2**

- _Goal:_ A resume's agenda carries its residual inputs and core surfaces in § 6.2's order and ends in a `gate proceed`
  that auto-proceeds only under `--next` on a compile with nothing that would block a bare-clean orientation.

- _Outcome:_ Wired asynchronous work-unit resume compilation through the CLI, sharing asserted envelope assembly
  with stops. Added ordered orientation surfaces, published guidance as text, complete locus narration, degraded-slot
  isolation and store notices. The proceed gate checks compiler surfaces, offers, cleanliness and parsed meta blockers;
  the native adapter exercises the full read/residual/gate path.

### `[x]` **2.5 Compile the checkout-local and notes surfaces — § 5.5, § 6.2, § 7.1**

- _Goal:_ Every worktree, dirty, base, and notes condition compiles to its § 6.2 render with CLI-composed text, a
  channel renders as behind only where Task 2.2 marks it unsynced, and the notes surfaces live in the cutover module.

    - `[x]` **2.5.a Compile the worktree and base surfaces**
        - Added ordered worktree/base/dirty rendering from probe facts, with path-specific unsynced guards and husk
          suppression. Remote reachability and pending-fetch messages stay distinct; base text reuses the shared
          composer and retains refresh remedies as text. Resume assembly shares one sync-state calculation.

    - `[x]` **2.5.b Compile the notes surfaces in the cutover module**
        - Added notes status, drift, lag, pending-load, and retired-subdir renders, preserving unsynced decisions and
          exact compaction nudge markers. The store-sync renderer lives with permanent core orientation so removing
          legacy notes compilation retains the store's advisory surface.

### `[x]` **2.6 Compile the cleanup lists under their action limits — § 4.11, § 6.1, § 6.2, § 6.3, § 14.1**

- _Goal:_ Every cleanup list renders today's text from its reports and offers each removable report's own published
  remedy, while every blocked, owner-held, or manual-only entry stays text and nothing becomes automatic or gains a
  forbidden flag.

- _Outcome:_ Added report-specific cleanup rendering and standing choices, composed into the ordered resume. Published
  teardown, move, and branch-delete arguments remain literal; blocked and owner-held remedies stay text. Current-husk
  teardown runs from the resolved primary and hands off, as does a successor start. Linked residues replace the primary
  lists, missing-folder repairs remain text-only, and absent sweeps provide no cleanup action.

### `[x]` **2.7 Compile the reminders and in-flight advisories — § 2.4, § 6.2**

- _Goal:_ The reminder, in-flight work-unit, and concurrent-workload advisories render today's text for the rows that
  carry them, each once-per-day nudge carrying the marker path and value the agent writes after orienting, and a resume
  emits every Phase 2 surface in § 6.2's order.

- _Outcome:_ Added rate-limited capture and completion-tail advisories, carrying markers only for reminders actually
  rendered. Mergeability guidance and lifecycle remedies remain text. Discovery callers opt into the workload note,
  which omits zero classes; dormant payloads and unrelated warnings stay silent. The resume assembler emits simultaneous
  checkout, notes, cleanup, and reminder surfaces in the shared table order, with the applicable markers preserved.

## **Phase 3:** The spine and `read-load-set`

_Purpose:_ Replace `session-init` with the spine, author the read contract init and recovery share, and shrink the
skill to a hand-off — then prove the loop on a kit install. From this phase on, this checkout's own sessions run the
spine.

_Exit criterion:_ On a kit install with a work unit in progress, a session following the new spine reaches the same
orientation surfaces, questions, and proceed prompt as today's workflow on the same fixture, and the spine is within its
~13 KB budget.

### `[x]` **3.1 Author `read-load-set` and fire it from recovery — § 8.1**

- _Goal:_ One method executes every read mode for both consumers — init anchored on the `read` step's cursor, recovery on
  its audit report's — with groups, manifest order, and truncation continuation, and recovery keeps its stop rules.

    - `[x]` **3.1.a Author the method**
        - Added the ordinary overridable method with grouped reads, manifest-order interpretation, truncation
          continuation, and one shared strategic-slicing procedure. Init uses the read step's cursor; recovery uses
          verified audit anchors and retains its own failure policy.

    - `[x]` **3.1.b Ship it**
        - Registered the method in the install recipe, Configurable classifier, self-hosting manifest and inventory,
          and method trigger table. Fresh-install assertions cover its installed file and Configurable manifest entry.

    - `[x]` **3.1.c Fire it from recovery**
        - Recovery declares and invokes the method with verified audit anchors. Its checkout binding, missing-anchor
          stop, unlocatable-section stop, and pending-marker preservation remain in the recovery workflow.

### `[x]` **3.2 Replace `session-init` with the spine — § 9.1**

- _Goal:_ `session-init.md` is a spine within ~13 KB that executes any agenda by step type and orients by
  `orientation.shape`, naming no probe slot, slot field, or arm condition, and ships as a plain file.

- **Additional Context:** `strategy-workflow-authoring.md` (frontmatter, declarations, interlock markers)

    - `[x]` **3.2.a Author the spine**
        - Replaced probe and arm dispatch with typed step execution and shape-based orientation. Literal argv,
          carried recompiles, failed-action continuation, read invalidation, handoff, marker timing, state authority,
          mismatch recovery, and declared method fire-points remain bounded in the spine.

    - `[x]` **3.2.b Ship it as a plain file**
        - Renamed the package workflow and recipe entry, synced the Framework copy and manifest, and reduced the
          template inventory to ten. The startup base merge supplied the prerequisite manifest changes. Retired
          the replaced init prose pins while preserving the handoff and remaining probe-reference contracts.

    - `[x]` **3.2.c Check the budget**
        - The spine is 11,315 bytes; with the 2,610-byte reading method it is 18.9% of the frozen
          73,573-byte baseline workflow, inside both the ~13 KB spine budget and ~28% combined budget.

### `[x]` **3.3 Shrink the `arc-session` skill to a hand-off — § 9.2**

- _Goal:_ The skill runs the spine and passes its arguments as the verb's flags; its description line keeps the flag
  list and gains `--context`.

- _Outcome:_ Both canonical copies now hand arguments and the positional seed to the spine. The description retains
  the entry flags and includes `--context`; this checkout's Claude and Codex skill symlinks resolve to the updated
  Framework copy.

### `[x]` **3.4 Rehearse a plain resume on a kit install** — validate exit criterion at segment scope

- _Goal:_ Evidence that a plain resume runs end to end on the agenda and the spine with today's orientation.

- _Outcome:_ Identical committed mid-phase fixtures on the baseline and branch kits reached the same orientation
  surfaces, task facts, and proceed question. The spine session exercised the emitted strategic cursor and all three
  task-list slices; its size is 11,315 bytes. Complete transcripts, fixture, and comparison are retained under
  `~/dev/arc-evidence/session-init-agenda/rehearsals/`; executor-adherence limitations are recorded in
  `notes-session-init-agenda.md` § Plain-resume rehearsal.

## **Phase 4:** The remaining arms

_Purpose:_ Replicate the resume pilot across every other entering row and signal: each arm compiles to its § 5 step
sequence and reaches its method or owning workflow, with that workflow's entry adjusted where session-init no longer
acts for it.

_Mode:_ `replication` — closes when every row and branch-gone kind compiles as specified, batch-verified over fixtures
and rehearsals.

_Exit criterion:_ Each § 5.4 row and § 5.3 kind emits its specified steps and orientation over fixture probe values,
the `row-not-compiled` refusal is gone, and the `--plan`, `--errand`, branch-gone, Orient-discovery, and `--context`
rehearsals reach today's orientation except where the specification states a change.

### `[x]` **4.1 Compile branch-gone recovery — § 5.3**

- _Goal:_ Each recovery kind compiles to its § 5.3 steps: a free destination switches by a composed fetch and switch and
  recompiles, and every other outcome — a destination checked out elsewhere, a declined, deferred, surface-only,
  answered, or failed recovery, or an absent recovery slot — takes the held path to a `gate stop`.
    - _Amended in:_ 4.R (A2)

    - `[x]` **4.1.a Locate destinations**
        - Added a read-bound destination resolver over exact switch candidates and the base fallback. Candidate
          checkout paths take precedence; absent paths require Git's worktree registry. Occupied or unreadable
          destinations remain held. Only a confirmed missing local ref adds a fetch before the literal switch.

    - `[x]` **4.1.b Compile each kind**
        - Added recommendation-driven decisions for free switches, occupied destinations, published teardowns,
          per-candidate menus, the base fallback, and pending refresh. Recompiles retain the kind-specific question
          and execution state; surface-only and recorded decisions stay held, and teardowns record nothing.

    - `[x]` **4.1.c Compile the held path**
        - Held recovery reads universal or selected work-unit context, conserves recovery and remedy text, shares
          ordered orientation surfaces, and stops. Transients use subject orientation; absent notes use history when
          no load is offered. Missing probes degrade locally; unused intent and discovery workload remain quiet.

- _Outcome:_ Shared read grouping and orientation assembly now serve both resume and held recovery. Native CLI
  coverage checks the composed fetch/switch plan while preserving the current checkout and code refs; ordinary
  resume coverage exercises the same shared assembly.

### `[x]` **4.R Preserve literal recovery branch operands**

- _Goal:_ Apply A2 to recovery composition: separate branch operands with `--`, hold the checkout-history alias `-`
  with manual guidance, and preserve the remaining recovery choices and schema.

- _Outcome:_ Recovery fetch and switch argv now delimit branch names with `--`. Literal `-` destinations remain
  manual, with no sole-destination offer and a bare choice in ambiguous menus; held guidance preserves published
  text and occupied-checkout guidance. Real producer fixtures and native Git scenarios cover ordinary, option-looking,
  and alias names while preserving checkout, previous-checkout history, and code refs.

### `[x]` **4.R2 Use backend capture selectors for Errand entry**

- _Goal:_ Apply A3 to explicit Errand entry: retain legacy title selection and use qualified capture IDs after the
  flip, without changing the agenda schema, workflow argument shape, or adoption refusal checks.

- _Outcome:_ Errand pickers retain legacy titles and project flagged store captures to title-plus-qualified-ID labels,
  preserving duplicate titles. Explicit personal/project IDs reach the real adoption planner unchanged, including
  disappeared selections that refuse and recover after repair; other text remains a new concern after the flip.
  Fixtures bind their served envelope and entry store to the same backend mode.

### `[ ]` **4.2 Compile the signal rows — § 5.4, § 12**

- _Goal:_ `--errand` (queue head, seeded, bare), `--plan` (found, bare or not found), `--housekeep`, and `--context`
  each compile to their § 5.4 sequence on a notes-only prefix, and the workflows they enter own their entry.

    - `[x]` **4.2.a Compile the `--errand` rows**
        - Extracted the shared typed queue resolver and retained handler refusals. Seeded, flagged-capture, bare-pick,
          and queue-head entries now compile on the notes-only prefix, with checkout framing and literal recompiles.
          Failed inbox reads retain elicitation and recover after repair; native cases preserve inbox, checkout, and refs.

        - _Amended in:_ 4.R2 (A3)

    - `[x]` **4.2.b Compile the `--plan` rows**
        - Added selected-store and filesystem stub lookup, canonical subject orientation, and the exact grooming-branch
          skip. Bare, missing, and failed lookups offer literal elicitation or decline; new unmatched values get their
          own keys and real refusals retain their messages. Native cases preserve checkout and refs across all outcomes.

    - `[ ]` **4.2.c Compile `--housekeep` and `--context`**
        - Build `test-first` (one behavior at a time), replacing the retired `--housekeep` entry pins:
            - `--housekeep` enters `drain-inbox` with no arguments, orientation `subject` with `key: null`
            - `--context` reads the universal set, renders the checkout surfaces, and stops with orientation
              `checkout`, emitting no work-unit artifact or surface on a work-unit checkout
            - the signal rows emit the checkout renders and no discovery route, reminder, `concurrent-workload`, or
              work-unit surface
            - a signal row renders degraded lines only for the slots its checkout renders draw on

    - `[ ]` **4.2.d Hand the entries to their workflows**
        - Point `compileErrandSignal` at the shipped `supplemental/run-errand.md` target and verify emitted workflow
          paths against installed files in the native signal cases
        - `run-errand.md`: Launch renders `arc errand open`'s `recommendedPromptText` and works from
          `allocation.checkoutPath`; Resume consumes only the checkout session-init selected and no longer materializes;
          its entry names the arguments it receives — `mode`, `seed`, `fromInbox`, `isolate`, and on resume `subject`
          and `generation`
        - `draft-design.md`: the grooming-entry skip applies only on a grooming branch, so `arc plan check` runs on
          every other `--plan` entry; its entry names `stub` and `onGroomingBranch`
        - Both copies; re-pin any test reading the changed text

### `[ ]` **4.3 Compile transient resumes and the contextless husk — § 5.4**

- _Goal:_ A transient row enters its owning workflow by recovery's mapping with its exact subject and generation, and a
  contextless current husk orients on the husk and stops.

- Export `transientWorkflow` (`lib/recover/locus-context.ts`)
- Build `test-first` (one behavior at a time), replacing the retired groom and housekeep dispatch pins:
    - `errand` and `partial-errand` enter `run-errand` with `mode: "resume"`, `groom` enters `draft-design`, and
      `housekeep` enters `drain-inbox`, each by `transientWorkflow`
    - the fragment carries the subject's kind and key and the marker generation, a null `markerGeneration` passing
      through as `generation: null`, with orientation `subject`
    - a partial Errand compiles without an identity
    - a transient resume runs the full prefix, the worktree pull and superseded reset included, and renders degraded
      lines only for the slots its checkout renders draw on
    - a contextless current husk runs the full prefix, renders `husk` and its other surfaces, and stops with
      orientation `work-state`
    - neither a transient resume nor a contextless husk renders `concurrent-workload` when the probe emits it

### `[ ]` **4.4 Compile `--start` and author `assess-start-readiness` — § 5.4, § 8.2**

- _Goal:_ A resolvable `--start` target compiles to its reads, the readiness renders, the `assess-start-readiness`
  fragment, and a `gate launch`; an unresolved one to a `start-target` note and the entry row as if absent.

- _Note:_ See `notes-session-init-agenda.md` § Shipping a file and § Carried context.

    - `[ ]` **4.4.a Compile the row**
        - Extract a shared lifecycle resolver from `handleLifecycleStatus` (`handlers/status/lifecycle.ts`), covering
          both its in-repository and store branches, that returns a state or a typed unresolved reason; it reads with
          `local` acquisition, so the verb writes nothing, and `arc status <slug>` calls it
        - The fragment's arguments are the `slug`, its meta path (`resolveBacklogStub().metaPath`), and the task list
          the meta's `taskList` field names, when present; both read `full`, with no cursor, since the probe computes
          none for a backlog target
        - Build `test-first` (one behavior at a time):
            - the slug resolves through the shared resolver, `arc start`'s `isComposedLifecycleSlugIndeterminate`
              quality check first
            - an indeterminate slug, a store refusal other than `not-found` with ambiguity included, or the conflict
              refusal the handler composes is unresolved, its note naming the warning or refusal
            - `provisional` and `planned` resolve; `nonexistent`, `shipped`, and the started states — `planning`,
              `active`, `integrating`, and `parked` — are unresolved
            - a resolved target reads its meta and any task list, renders the dirty tree, the freshness note on a
              work-unit checkout, the worktree states and `stale-base` as readiness input with no sync step, the notes
              surfaces, and `concurrent-workload`, then the fragment and `gate launch`
            - orientation is `subject` with `kind: "work-unit"`

    - `[ ]` **4.4.b Author the method**
        - Moved from today's focused-recon arm: best-effort readiness, Tier 1 gates by `arc status <slug>` and base
          drift where a readiness baseline exists, Tier 2 reading the agenda's `concurrent-workload` note; the launch
          question; `arc start <slug>` with its interlocks unchanged; the seeded mini-handoff check at the path
          `materializeWorkUnitSessionNotesPath` gives; the generic handoff with no harness-specific command; the
          informed opt-in before moving the session
        - Ship it per the notes, declare it in the spine's `arc.methods`, and add it to both of
          `integration/init.test.ts`'s method lists

### `[ ]` **4.5 Compile Orient, author `discover-next-work`, and offer the routes — § 5.4, § 5.8, § 7.2, § 8.3**

- _Goal:_ Orient compiles to the prefix, the `discover-next-work` fragment, its renders with the materialize and
  housekeep route offers, and a `gate stop`; the method carries both `pm.mode` arms and fires `assess-parallel-fit`.

- _Note:_ `assess-parallel-fit.md` ships and becomes Configurable with this task; see `notes-session-init-agenda.md`
  § Shipping a file.

    - `[ ]` **4.5.a Compile the row and its routes**
        - A route action whose `checkout` is absent or equals the session's checkout recompiles; any other `--here`
          action, `arc start --new --here` included, hands off; `arc locus release` always recompiles
        - Build `test-first` (one behavior at a time), replacing the retired Errand-materialize and materialize-exactness
          pins:
            - every `free-primary`, `unmanaged-checkout`, and `retired` row but cold-start is Orient, orientation
              `work-state`, running the full prefix and rendering `concurrent-workload`
            - the fragment's arguments are `pmMode`, `protection`, and `seed` when present; a followed fragment does
              not run again after a pick recompiles
            - with the `config` slot failed, Orient emits no `discover-next-work` fragment, and a positional seed
              becomes an `unconsumed-signal` note
            - the materializable work-unit offer has a choice per published action: a spawning `arc materialize <name>`
              hands off, and the session's own `--here` exits recompile
            - `refreshRemedy` is its own recompiling choice, offered with no candidates under `materialize:` with an
              empty operand, and the slot's copy of the same refresh in its `actions` is not offered again
            - before the flip, the cutover module adds an in-place choice per candidate running
              `arc materialize <name> --here` then `arc user pull`, recompiling
            - the materializable Errand offer runs the argv `findMaterializableErrands` publishes and hands off
            - a failed `materializableWorkUnits` or `errandState` slot renders degraded and offers no route
            - on a primary checkout, `housekeep` offers a `signal` choice for `housekeep`
            - the route offers sit at their surfaces' places, in order

    - `[ ]` **4.5.b Author the method**
        - Moved from today's Step 4: the seed pre-focus with a confirm-only init offer; the `arc-in-git` and other
          `pm.mode` arms as prose, following the argument's arm; `assess-parallel-fit`'s multi-candidate selection as
          advisory input, declared in the method's own `arc.methods`; `arc start` under full protection, `create-spec`
          under partial
        - Ship it per the notes, declare it in the spine's `arc.methods`, retarget `assess-parallel-fit.md`'s
          consuming-workflow lines to the method, and add both methods to both of `integration/init.test.ts`'s method
          lists

### `[ ]` **4.6 Compile cold-start and retire the interim refusal — § 5.7**

- _Goal:_ An unmanaged linked checkout with a branch enters the advisory `in-flight-scope-check` and a
  `cold-start:scaffold` offer that shows the seed's resolved disposition; its accept starts the work unit here and
  recompiles without the seed, and a decline or an answered offer compiles Orient. With this last row compiled, the
  `row-not-compiled` refusal is gone.

- _Note:_ `in-flight-scope-check.md` ships with this task, declaring `assess-parallel-fit`, which Task 4.5 shipped;
  see `notes-session-init-agenda.md` § Shipping a file.

- Delete the `row-not-compiled` refusal and its tests
- Build `test-first` (one behavior at a time):
    - the row runs no prefix before its decline
    - the offer's text gives the seed's disposition as `parseSpecInput` classifies it: an issue reference becomes the
      meta's `Origin`, and any other seed passes through
    - accept runs `arc start --here --from <seed>`, or bare `arc start --here`, and recompiles without the seed
    - decline compiles the Orient steps, `concurrent-workload` included; an answered offer compiles Orient without the
      scope check
    - after a successful start, the recompile is a work-unit resume

### `[ ]` **4.7 Verify every arm across fixtures and rehearsals** — validate exit criterion at segment scope

- _Goal:_ Evidence that every row and branch-gone kind compiles as specified, the verb still writes nothing, and the
  arms reach today's orientation.

    - Run the compiler's unit suite over the fixture probe values: every § 5.4 row and § 5.3 kind, the held path, the
      bare `--errand` declines with and without `--isolate`, the `--plan` decline, and an unresolved `--start`
    - Re-run Task 1.5.d's no-write proof over Phase 4's new reads: the errand queue, the inbox, the stub lookup, the
      lifecycle resolver, and the worktree list
    - Rehearse on kit installs from this branch, each against today's workflow on the same fixture, and record them
      beside Task 3.4's: `--plan` over a backlog stub, `--errand` with a queued and a flagged capture, branch-gone
      after deleting the remote branch, Orient discovery with a remote-only work unit, and `--context` from a work-unit
      checkout
    - Run `arc check segment`

## **Phase 5:** Removals, the cheap tier, and propagation

_Purpose:_ Retire what the spine replaced, cut the always-loaded documents' cheap tier, retarget every remaining
shipped reader of the old workflow and envelope, and measure the done-signal against the Phase 1 baseline.

_Mode:_ `replication` — closes when every § 10–§ 12 surface is converted in every copy that carries it and
batch-verified.

_Exit criterion:_ No shipped file or source comment references a removed file or section; every § 11 change lands in
every copy § 11 assigns it and every § 12 reader in both copies; `framework-sync`, link validation, and the integration
tier pass against the new text.

### `[ ]` **5.1 Remove the contributor variant and the envelope reference — § 10**

- _Goal:_ Neither `session-init.contributor.md` nor `probe-envelope.md` remains in either copy or the recipe, no shipped
  file references them, and the `inboxState` routable-count note reads from the served envelope schema.

- _Note:_ See `notes-session-init-agenda.md` § Shipping a file and § Test pins.

    - `[ ]` **5.1.a Remove the contributor variant**
        - The file and its recipe entry; contributors take the ordinary path, with `AGENT-BRIEF.CONTRIBUTOR` among the
          universal reads (Task 2.3)

    - `[ ]` **5.1.b Remove the envelope reference**
        - Both copies and the recipe entry; the `inboxState` routable-count note `init-work-unit.md` relies on moves into
          `.describe()` on those fields, which `arc schema get session-init-envelope` serves. The text carries no `§`,
          which `lint:arc:section-refs` refuses in `src`, and no `.arc/` path
        - `locus-methodology-contracts.test.ts`'s pin of that note reads the served schema; its pins of the removed
          file's absence retire
        - The delivery-position workflow test's pins of `probe-envelope.md` text retire, since
          `session-init-delivery-position-readonly.test.ts` covers the probe's passivity

### `[ ]` **5.2 Cut the always-loaded cheap tier — § 11**

- _Goal:_ Each § 11 cut and correction lands in every copy § 11 assigns it, every destination of moved text has an
  install disposition, and no rule's placement or load-set membership changes.

- _Note:_ `DEV-RULES.ARC` and `AGENT-BRIEF.ARC` change in both copies. The Configurable templates change in package
  source, and this repository's copy, its own filled document, takes a change only where it carries the template's text
  verbatim; never copy one over the other. `pr-lifecycle` and `review-gate-workflows` read these files at the commit
  gate.

- **Additional Context:** `notes-session-init-agenda.md` § The always-loaded cut audit

    - `[ ]` **5.2.a `DEV-RULES.ARC`**
        - § When to Load's stale clause, keeping "load it before beginning any task"; the duplicate `STRATEGY-INDEX`,
          workflow-authoring, and methods bullets; the preamble's `DEV-RULES.PROJECT` pointer; § Discovered Work
          Routing's Errand-vs-work-unit pointer; § Method loading's sentence restated in
          `strategy-workflow-authoring.md`; § Artifact relocatability's narrative
        - Remove the link definitions the cuts leave unused — `[workflow-authoring]`, `[arc-methods-dir]`, and
          `[dev-rules-project]`; `[strategy-index]` stays in use
        - § Commit control reads the commit interlock as `config.value.settings["commit.interlock"]` from the agenda's
          residual `config`, and its `releaseRouting` lookups read the agenda's residual inputs or the envelope

    - `[ ]` **5.2.b `AGENT-BRIEF.ARC`**
        - Correct the pipeline line and the release-push "takes no target argument" claim (`arg-grammar.ts` accepts a
          matching `origin <branch>` pair, with or without `-u`); cut § Directory Structure's backlog-nesting line and
          the footer

    - `[ ]` **5.2.c `STRATEGY-INDEX` and `QUICK-REFERENCE.template`**
        - The index's purpose sentence and "these ship with the framework" line in both copies; its "create project
          strategies" prose and example list in package source
        - The reference's duplicate `.arc/` row and fill-time comments, in package source; its heading stays, since the
          partial read keys on it

    - `[ ]` **5.2.d `AGENT-BRIEF.PROJECT.template` and `DEV-RULES.PROJECT`**
        - The brief's fill-time comments, their examples moved into `02_define-project`'s step, and the stale
          "constitution" in § Repository Layout's `.arc/` line, in package source; its footer in both copies
        - The shipped rules in package source: correct the domain-rules paragraph's `constitution/` path to
          `system/rules/` and the stale "constitution" in § File Organization's `.arc/` line; cut the duplicate
          pointers, the quality-gates definition sentence, the fill-time comments, and the self-description; cut the
          capture-routing default text down to its heading and a placeholder line, which
          `03_configure-external-integration` targets
        - This repository's copy takes the duplicate pointers it shares verbatim and keeps its filled self-description
          and its project-specific Capture Routing

### `[ ]` **5.3 Retarget the remaining shipped readers — § 12**

- _Goal:_ Every § 12 reader not retargeted with its arm describes the agenda-driven session correctly in both copies,
  and no source comment cites a section the spine removed.

- _Note:_ `run-errand.md` and `draft-design.md` moved with their arms (Task 4.2), `session-recover.md` with
  `read-load-set` (Task 3.1), and `assess-parallel-fit.md` with `discover-next-work` (Task 4.5).

    - `[ ]` **5.3.a The loading-model readers**
        - `strategy-session-operations.md` § Probe pattern, § Extension contract, § Handoff envelope fields (its pointer
          to the session-init field table points at `arc schema get session-init-envelope`), § Loading Mechanisms
          § Session initialization, and § Session-Init Consumption, whose "Agent-file active gate" describes a load no
          workflow performs and leaves with the rewrite
        - `system/methods/README.md`'s loading model; `strategy-configurability-architecture.md`'s configuration
          source; `reference/briefs/README.md`'s pointer
        - `template-dev-rules.md`'s domain-rules warning, which now arrives as a `note`

    - `[ ]` **5.3.b The lifecycle and configuration readers**
        - `init-work-unit.md`'s inbox backstop reads the agenda's residual `inboxState`, keeping the fresh probe as the
          fallback; `session-handoff.template.md`'s Next Task drops the graduated-lookup clause
        - `arc-config.yml` in both copies: the four `session.init_pull` and `session.init_load` comments describe their
          policies in place, and the base policy's `always` line drops "(refused on a dirty tree)"
        - `AGENT-BRIEF.CONTRIBUTOR.md`: the ordinary path with the brief among the universal reads and the per-work-unit
          session notes
        - Re-pin any test reading the changed text

    - `[ ]` **5.3.c The source comments**
        - Rewrite the comments that cite session-init's removed steps to say what the code does:
          `commands/active/types.ts`, `commands/active/status.ts`, `commands/status/types.ts`, `lib/load-set/types.ts`,
          and `lib/session-init/recommended-action.ts`, with no workflow, step, or `§` reference

### `[ ]` **5.4 Measure the done-signal — Success Criteria 1–3**

- _Goal:_ Both parts of the done-signal are measured by the Phase 1 instruments and recorded beside the baseline.

    - Part 1, per row — a plain resume, Orient, and `--start`: the itemized runs over the spine, `read-load-set`, and
      that row's method, if any, and a real session whose only reads are those files, against ~28% of the baseline
      `session-init.md` by each instrument
    - Part 2: a kit install from this branch entering Orient, the real session's load before the first user-facing
      line less an empty session's, and the itemized runs over the result's always-read set — the agenda output in
      place of the envelope, the spine, `read-load-set`, and `discover-next-work` in place of `session-init.md` —
      against ~60% of the baseline
    - Task 1.1's procedure: the same scripts given the result's item lists, the same first-response rule, and the link
      fill when the install needs it, recorded either way
    - Raw outputs under `~/dev/arc-evidence/session-init-agenda/result/`; the comparison in
      `notes-session-init-agenda.md` § Sizing and measurement

### `[ ]` **5.5 Verify the shipped surface** — validate exit criterion at segment scope

- _Goal:_ Evidence that every § 10–§ 12 surface is converted in every copy that carries it and the pins hold.

    - Search both copies and `packages/arc-framework/src` for references to the removed files and to the old workflow's
      sections
    - Run `framework-sync`, link validation, and `arc check run test:integration:content --range`
    - Run `arc check segment`

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` The baseline is recorded by both instruments from a kit install of the unchanged base before any shipped-text
  commit

- `[ ]` On a plain resume, Orient, and `--start`, the spine plus `read-load-set` plus the entered arm's method is at most
  ~28% of the baseline `session-init.md` by both instruments

- `[ ]` On a kit install entering Orient, the load before the first user-facing line less an empty session's is at most
  ~60% of the baseline's

- `[ ]` `arc agenda session-init --json` validates against `arc schema get session-init-agenda`, refuses each invalid
  flag combination with a typed error, and before the flip leaves files, refs, notes, and markers as found apart from
  `FETCH_HEAD`, with both temporary refs deleted

- `[ ]` Each § 5.4 row and § 5.3 kind compiles to its specified steps and `orientation` over fixture probe values,
  including the held path, the bare `--errand` declines with and without `--isolate`, the `--plan` decline, and an
  unresolved `--start`

- `[ ]` Each § 6 surface compiles to its mapped step with CLI-composed text, and a failed slot yields its degraded-slot
  render and no action

- `[ ]` No surface whose rule withholds automatic execution compiles to an `exec`, no withheld or owner-held remedy
  compiles to an action, and every action argv is published or compiler-composed

- `[ ]` Every sync `exec` and sync choice recompiles, every `exec` ends its agenda, a combined offer replaces two, the
  user-reference apply follows the sync steps, and every recompile argv carries the signals, answers, and done ids its
  position implies, so no answered offer, done `exec`, or followed method fragment recurs

- `[ ]` `session-init.md` is within ~13 KB, names no probe slot, slot field, or arm condition, and ships without the
  `.template.md` suffix

- `[ ]` `read-load-set`, `assess-start-readiness`, and `discover-next-work` are declared in the spine, carried in
  `init-recipe.json` and `CONFIGURABLE_FILES`, and present on a fresh `arc init`; `assess-parallel-fit.md` and
  `in-flight-scope-check.md` ship; `session-recover.md` fires `read-load-set` and keeps its stop rules

- `[ ]` `session-init.contributor.md` and `probe-envelope.md` are gone from both copies and the recipe, no shipped file
  references them, and the `inboxState` routable-count note appears in the served envelope schema

- `[ ]` Each § 11 change lands in every copy § 11 assigns it, and every destination of moved text has an install
  disposition

- `[ ]` Each § 12 reader is retargeted, and every wording-pin test passes against the new text

- `[ ]` The plain resume, `--plan`, `--errand`, branch-gone, Orient discovery, and `--context` rehearsals each start
  from a kit install and reach today's orientation surfaces, questions, and actions except where the specification
  states a change

- `[ ]` Elicited `errand` and `plan` options are inserted before any `--` delimiter, with `--flag=value` for a
  leading-dash answer; both the literal answer and leading-dash positional seed survive parsing, and the served
  description and spine state that rule (A1)

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration

- `[ ]` Recovery fetch and switch argv put `--` before the branch operand; a literal `-` has no executable action,
  remains held with manual guidance when sole, and appears as a bare manual choice in an ambiguous menu (A2)

- `[ ]` Before the flip, Errand capture titles retain selection and adoption; after it, flagged personal picker labels
  include title and ID, choices carry qualified IDs, and personal/project ID seeds retain adoption refusal checks.
  Other text remains a new concern, including a flagged title; the agenda schema is unchanged (A3)
