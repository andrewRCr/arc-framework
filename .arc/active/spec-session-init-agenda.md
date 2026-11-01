# Spec (`detailed` · `RFC`): session-init-agenda

- **Origin:** [internal]

- **Purpose:** Make the CLI decide what a starting session reads and how it orients. A new `arc agenda session-init`
  verb compiles an ordered list of typed steps from the state the session-init probe reads; `session-init.md` becomes a
  short spine that executes those steps; each arm that needs agent judgment becomes a method the agenda names; and the
  always-loaded documents lose the text no session needs.

---

## Introduction / Context

A session starts through the `arc-session` skill, which tells the agent to run `session-init.md`. That workflow has the
agent run the composite probe `arc status --session-init --json` (`runSessionInitStatus`,
`commands/status/run.ts`), then read and act on the whole workflow: branch-gone recovery, four signal arms, the
focused `--start` recon, cold-start, materialize, three sync channels and a notes-load dispatch, the context-load list,
freshness and next-work discovery, some thirty conditional orientation surfaces, and mismatch handling. The agent reads
every arm whether or not it applies. The workflow is the largest single item before the session's first user-facing
line, and each new probe surface adds three always-read costs to it: a slot description, dispatch prose, and a
rendering rule.

### Baseline

Measured on 2026-10-31 as bytes ÷ 4, a rough proxy that dense table cells tokenize worse than prose:

| Item before the first user-facing line         | Fresh install     | This repository   |
| ---------------------------------------------- | ----------------- | ----------------- |
| `session-init.md`                              | 73.6 KB           | 73.6 KB           |
| `AGENT-BRIEF.ARC`                              | 9.9 KB            | 9.9 KB            |
| `DEV-RULES.ARC`                                | 33.9 KB           | 33.9 KB           |
| `DEV-RULES.PROJECT`                            | 5.1 KB            | 24.3 KB           |
| `STRATEGY-INDEX`                               | 5.7 KB            | 7.2 KB            |
| `AGENT-BRIEF.PROJECT`                          | 2.0 KB            | 1.8 KB            |
| `QUICK-REFERENCE` § Environment & Path Context | 1.3 KB            | 1.4 KB            |
| `WORKING-MEMORY`                               | absent            | 20.6 KB           |
| `arc status --session-init --json` envelope    | ~12 KB            | 42.6 KB           |
| `arc-session` skill text                       | 3.0 KB            | 3.0 KB            |
| **Total**                                      | **~147 KB ≈ 37k** | **~218 KB ≈ 55k** |

A resume adds its lifecycle workflow, meta, and SESSION-NOTES on top. The fresh-install envelope figure is an estimate,
not a measurement.

Steps 2 (dispatch and sync, 25.2 KB) and 5 (orientation, 25.6 KB) are 69% of `session-init.md`. Most of both is
dispatch over slots whose text the CLI already composes — `inferSessionInitRecommendations` builds each sync channel's
`recommendedPromptText` and the `recommendedCombinedPrompt`, `composeBaseDriftRegister` the base-drift text,
`deriveDerivedLocusSessionGuidance` the locus narration, `readDeliveryPositionView` the delivery line — so the prose
restates each condition and then says to render the CLI's text verbatim. A plain resume acts on Step 1, the sync
channels, Step 3's load set, and one or two Step 5 surfaces: well under a fifth of the file.

The envelope is a lever too. In this repository `derivedLocusState.value.roster` repeats the full `context.loadSet` of
every registered checkout that resolves a context, and is about 70% of the envelope's bytes.

### What exists to build on

- **The probe** (`runSessionInitStatus`) fans out to independent slot readers, each a typed `Probe<T>` (`ok: true` with
  `value`, or `ok: false` with an error), so one slot's failure degrades only that slot. Its envelope is validated by
  `assertSessionInitProbeResult` against the strict `SessionInitEnvelopeObjectSchema`.
- **The frame.** `derivedLocusState.value.entering` selects the session's row: a `work-unit` row with its resolved
  `context` (session type, workflow, task cursor, cohort document, load set), a `transient` row (an Errand, a partial
  Errand, a grooming set, or a housekeep sweep), or a `free-primary`, `unmanaged-checkout`, or `retired` row, or no row
  at all (`unresolved`). `locusGuidance` carries the CLI's narration of that frame.
- **Composed text.** Sync channels publish `recommendedAction` (`pull`, `prompt`, `surface`, `skip`) with
  `recommendedPromptText`; cleanup surfaces publish `SessionAction` remedies (`lib/session-init/actions.ts`): a `text`,
  an optional `argv`, and an optional absolute `checkout`.
- **The load set.** `resolveLoadSetManifest` composes the ordered context documents, each a `LoadSetEntry` with a
  `readMode` of `full`, `partial-section` (a named heading), or `partial-strategic` (the task-list header, current phase
  preamble, and current task section). `LOAD_SET_MANIFEST_VERSION` is `1`.
- **Recovery** (`session-recover.md`, `arc recover`) already maps a transient subject to its owning workflow
  (`transientWorkflow`, `lib/recover/locus-context.ts`) and appends that path to its load set
  (`appendRecoveryWorkflow`), and already slices a `partial-strategic` read from the task cursor's anchors.
- **Schemas.** `arc schema get <id>` serves registered Zod schemas as JSON Schema through `z.toJSONSchema`, so a
  field's `.describe()` text reaches the served schema.

### The flip

ARC is moving operational and planning state from tracked branch files and Git notes into same-repository refs behind
one storage contract. **The flip** is the one change per repository after which the configured store reports
`capabilities.stateOffBranch` (read through `usesOffBranchState`, `lib/store/lifecycle-write.ts`). Before the flip,
SESSION-NOTES, WORKING-MEMORY, and USER-INBOX are gitignored files under `.arc/user/<identity>/`, carried between
machines by `arc user pull` and `arc user load`. After it, session notes are a section of the work unit's meta record.
**The cutover** is the change that performs the flip. This change lands before the flip, which is further out than
this build, and must work on both sides of it; § 7 isolates what the flip retires.

## Goals

1. **Part 1 of the done-signal.** The session-init text an agent reads at init — the spine, `read-load-set`, and the
   method of the arm it enters, if any — is at most ~28% of today's `session-init.md`, on every arm.
2. **Part 2 of the done-signal.** A fresh install's load before the first user-facing line, less an empty session's
   load on the same harness, is at most ~60% of its baseline.
3. **The CLI computes what it can.** The agent dispatches on nothing the CLI can decide: arm selection, sync actions,
   their argv, and every orientation surface's text are compiled. The agent keeps judgment — recommendations at offers,
   the thought-state orientation lines, mismatch handling — and the person keeps every decision today's workflow leaves
   to them.
4. **Constant core.** A new probe surface or conditional arm adds a compiler case and, for an arm, a method; it adds no
   line to the spine unless the arm needs an orientation shape outside the spine's closed set (§ 9.1).
5. **Parity.** Every arm today's workflow runs still runs, in the same order, with the same withheld actions, stops, and
   person-owned decisions, except where this specification states a change.
6. **Cheaper always-loaded documents.** The always-loaded documents lose stale, duplicate, and fill-time text (§ 11)
   without changing load-set membership or any rule's placement.

Goals 1 and 2 are the two parts of the **done-signal**, the measured test that this change worked. Both are reductions
against a baseline taken by the same instruments before the build starts (Success Criteria 1–3).

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This change does not:

- **compile an agenda for any ceremony but session-init.** `session-handoff` and `session-recover` keep their workflows;
  `session-recover` shares only the read contract (§ 8.1);
- **give workflows in general a contract shape, a fragment substrate, method visibility, an override policy, stable
  anchors, or a `slug → artifact` resolver.** The three new methods are ordinary public, overridable methods;
- **move or re-place rule and vocabulary text in the always-loaded documents,** change which documents the load set
  holds, or change `STRATEGY-INDEX`'s maintenance rule;
- **change probe performance or the probe envelope's shape;** the envelope's text changes only in the superseded
  reset's prompt (§ 5.2);
- **define advisory registers or their cadence;**
- **unify the agenda's text and action payloads with any other CLI output type;**
- **compile the `--start` readiness vet from `arc start`'s preflight:** the vet stays agent-side (§ 8.2) and may report
  ready where `arc start` refuses;
- **add a session-role dimension:** the arm set is not hard-coded against one;
- **create a command that moves a `--plan` session onto a grooming branch;**
- **rename the cohort, the "work unit" term, or the stale `constitution/` paths outside the load path.**

## Proposed Design

§ 1 defines the terms. § 2 is the verb and § 3 its output contract; § 4 says how an agenda executes, § 5 what the
compiler emits for each entering row, and § 6 how each orientation surface maps to a step. § 7 isolates the pre-flip
notes behavior. § 8 is the three methods, § 9 the spine and the skill, § 10 the removals, § 11 the always-loaded cuts,
and § 12 the shipped readers to retarget. § 13 records the boundary and order, and § 14 the expected contracts.

### 1. Terms

- **Agenda** — the ordered list of typed steps the verb prints for one session start. Emission order is execution
  order.
- **Step** — one entry in an agenda, of one of seven types: `read`, `exec`, `offer`, `fragment`, `render`, `note`,
  `gate` (§ 3.2).
- **Spine** — `session-init.md` after this change: how to obtain and execute an agenda and how to orient (§ 9).
- **Fragment** — what a `fragment` step names: a declared method, or an existing workflow at a path the CLI derives.
  The agent loads it at that step and follows it with the step's arguments. The CLI never injects content.
- **Entering row** — `derivedLocusState.value.entering`'s selected row, or its absence; the compiler's frame authority.
- **Signal** — a flag the skill passes: the positional seed, `--plan`, `--errand`, `--next`, `--isolate`, `--start`,
  `--housekeep`, `--context`.
- **Recompile** — running the compiler-built argv a step or choice carries, which re-invokes the verb with the
  session's signals and answers, and starting the fresh agenda from its top.

These four terms — agenda, step, spine, fragment — are defined in the spine itself, their only consumer.

### 2. The agenda verb

#### 2.1 Invocation

```text
arc agenda session-init [seed] [--plan [<stub>]] [--errand [<slug|description>]] [--next] [--isolate]
                        [--start <slug>] [--housekeep] [--context] [--json]
                        [--answered <key>=accept|decline]... [--done <id>]...
```

- `--answered` and `--done` carry the session's answers, completed `exec` steps, and followed method fragments across
  recompiles (§ 4.6). The compiler writes them into every argv it emits; neither the skill nor a person passes them.
- The verb lives in its own module beside the probe composer, not in `src/handlers/status.ts`, and reuses the slot
  readers `runSessionInitStatus` calls. It registers under the help group "Inspect work and context".
- `session-init` is the only accepted ceremony; any other refuses with a typed error naming the accepted value.
- The spine always passes `--json`. Without it the verb prints the same agenda for a person to read, as `arc status` and
  `arc plan check` do.

#### 2.2 Precedence and validity

The compiler resolves one row, in this order:

1. **Stops.** `derivedLocusState` failed, or `locusGuidance.kind === "unavailable"`; `entering.kind === "unresolved"`
   or `entering.row.kind === "unresolved-checkout"`; a `work-unit` row with no `context`, unless `currentHusk.ok` with a
   non-null `value` makes it a current husk. An absent `currentHusk` slot (it is read only on a linked, branchless
   checkout) or a failed one stops too, the failure also rendering as a degraded slot (§ 4.4).
2. **Branch-gone recovery**, when `worktree.value.state === "branch-gone"`.
3. **A signal:** `--errand`, `--housekeep`, `--plan`, or `--context`.
4. **`--start <slug>`.**
5. **The entry row:** a transient resume, a work-unit resume, a contextless current husk, cold-start, or Orient (§ 5).

Refusals, each a typed error with the offending flags named: two of `--errand`, `--housekeep`, `--plan`, `--context`
together; `--errand --next` with a slug or description; `--isolate` without `--errand`; a malformed `--answered` or
`--done` value. A `--start`, `--next`, or positional seed the winning row does not consume becomes a `note`, except on a
stop or branch-gone's held path (§ 5.1).

#### 2.3 What it prints

The agenda (§ 3): the ceremony, the accumulated signals and answers, the orientation shape, the residual judgment
inputs, and the steps. The residual inputs are the slots the spine and the always-loaded
rules still read during the session, at the envelope's own field paths: `config`, `releaseRouting`, `domainRules`, and,
on a primary checkout, `inboxState`. `domainRules.value.warnings` also each become a `note`.

The agenda schema registers as `session-init-agenda` beside `session-init-envelope`: in `SESSION_ENVELOPE_SCHEMA_IDS`
and the module's schema list (`lib/session-envelope/registry.ts`), which `registerSessionEnvelopeSchemas` adds to
`createProductionSchemaRegistry()`, and in the production id pin the tests hold (`PRODUCTION_SCHEMA_IDS`). Its residual
slots reference the registered `config-session-init`, `release-routing`, `domain-rules-session-init`, and `inbox-state`
schemas. The spine cites `arc schema get session-init-agenda` rather than restating shapes.

#### 2.4 What it writes

The verb adds no write of its own: compiling, recompiling, or running it by hand to inspect an agenda changes no file,
marker, or remote beyond what the probe's own slot readers do. Before the flip those readers leave the checkout's files,
refs, notes, and markers as they found them, apart from two temporary refs and `FETCH_HEAD`, which both of their fetches
rewrite. The in-flight discovery read of the identity's Errands, `readFetchedTransientInFlightIndexes`
(`lib/errand/record.ts`), fetches into a temporary `refs/arc/tmp/transient-discovery/<token>` ref and deletes it once
read; a failed delete is reported as that read's error. When the local and remote notes refs both exist and differ, the
user slot's `inspectUserSyncRefsDetailed` (`commands/user/sync-status.ts`) fetches the remote notes into a temporary
`refs/arc-sync-temp/<identity>_<token>` ref to compare ancestry and deletes it afterward, best-effort: a failed delete
leaves the ref and is not reported. After the flip the user slot runs the store's session-entry pull
(`probeStoreUserPull`, `lib/session-init/store-user-pull.ts`), as the probe does today; the compile reads the pulled
state. The once-per-day nudge markers (notes compaction, Errand reminder, stale in-flight work units) stay
agent-written: the `render` or `note` step that surfaces each carries the marker's path and value, and the agent writes
it after emitting the orientation that carries that step, as today.

#### 2.5 What stays

`arc status --session-init --json` is unchanged and remains the full read for the PreCompact seed hook, recovery's state
basis, `init-work-unit.md`'s inbox backstop when no agenda is held, and diagnosis.

### 3. The agenda contract

#### 3.1 Top level

The contract below is normative for field names, discriminants, and cardinalities; internal type and module names are
implementation detail.

```ts
type SessionInitAgenda = {
  schemaVersion: 1;
  mode: "agenda";
  ceremony: "session-init";
  signals: AgendaSignals;
  answers: AgendaAnswers;               // as received in `--answered` and `--done` (§ 4.6)
  orientation: AgendaOrientation;       // set from the row (§ 5.4)
  residual: {
    config: Probe<ConfigStatus>;        // the envelope's `config` slot, unchanged
    releaseRouting: Probe<ReleaseRouting>;
    domainRules: Probe<DomainRules>;
    inboxState?: Probe<InboxState>;     // primary checkout only, as in the envelope
  };
  steps: AgendaStep[];                  // at least one; see § 3.2 for the last step
};

type AgendaSignals = {
  seed?: string;                        // positional
  plan?: string | true;                 // `--plan` bare is `true`
  errand?: string | true;
  next?: true;
  isolate?: true;
  start?: string;
  housekeep?: true;
  context?: true;
};

type SignalName = "plan" | "errand" | "start" | "housekeep" | "context";

type AgendaAnswers = {
  answered: Record<string, "accept" | "decline">;   // question key → answer
  done: string[];                                   // `exec` ids run, `fragment:<name>` per method fragment followed
};

type AgendaOrientation =
  | { shape: "work-state" }
  | { shape: "subject";
      subject: { kind: "errand" | "partial-errand" | "groom" | "housekeep" | "work-unit"; key: string | null } }
  | { shape: "checkout" }
  | { shape: "none" };
```

Every argv the agenda carries that re-invokes the verb is compiler-built: `["arc", "agenda", "session-init", "--json"]`,
then the session's signals as that step or choice leaves them — a `signal` or `elicit` choice sets or clears its signal,
cold-start's accept drops the seed (§ 5.7), and an `ask: "orientation"` choice drops `--next` (§ 4.10) — and
the answers that reaching it implies (§ 4.6).

#### 3.2 Steps

```ts
type ExecutableAction = SessionAction & { argv: string[] };   // `argv` required, `checkout` optional

type AgendaStep =
  | { type: "read"; path: string; readMode: ReadMode; group: number;
      cursor?: TaskListCursor }                                // present iff readMode.kind is "partial-strategic"
  | { type: "exec"; id: string; actions: ExecutableAction[]; then: Then }
  | { type: "offer"; id: string; ask: "now" | "orientation"; text: string; choices: OfferChoice[] }
  | { type: "fragment"; target: { kind: "method"; name: string } | { kind: "workflow"; path: string };
      args: Record<string, string | number | boolean | null> }
  | { type: "render"; surface: string; text: string; marker?: NudgeMarker }
  | { type: "note"; surface: string; text: string; marker?: NudgeMarker }
  | { type: "gate"; kind: "proceed" | "launch" | "stop"; autoProceed: boolean };

type OfferChoice =
  | { kind: "bare"; label: string; decline?: true }
  | { kind: "actions"; label: string; accepts: string[]; actions: ExecutableAction[]; then: Then }
  | { kind: "signal"; label: string; signal: SignalName; value: string | true | null; decline?: true;
      recompile: string[] }
  | { kind: "elicit"; label: string; signal: "errand" | "plan"; carried?: string; recompile: string[] };

type Then = { kind: "recompile"; argv: string[] } | { kind: "handoff" };

type NudgeMarker = { path: string; value: string };
```

- **`read`.** `path` and `readMode` are a `LoadSetEntry`'s (`LoadSetPathSchema`, `ReadModeSchema`). `group` is a
  non-negative integer; groups are non-decreasing in step order. `cursor` is the task cursor's `TaskListCursorSchema`
  value (`section` and `leaf`, each `id`, `title`, `lineHint`). `LoadSetEntry` and `ReadMode` do not change: `group` and
  `cursor` live on the step.
- **`exec`.** At least one action. An `exec` is always the last step of its agenda: running it recompiles or hands off,
  and the next agenda, compiled with its id done, carries what follows.
- **`offer`.** `id` is one or more question keys joined by `+` (§ 4.6). `accepts` lists the question keys of `id` the
  choice accepts. A `signal` choice's `recompile` argv sets that signal to `value`, or clears it when `value` is `null`;
  clearing `errand` clears `isolate` with it, since `--isolate` alone is refused. An `elicit` choice asks the person for
  the signal's value, offering `carried` as a default, and runs its `recompile` argv with `--<signal> <answer>`
  appended; that argv omits the signal. A `bare` choice runs nothing and the agenda continues with the next step.
    - **`ask: "now"`** — a question the agent asks when it reaches the step, before continuing: sync, branch-gone,
      cold-start, and a bare signal's pick. At least two choices, exactly one carrying `decline: true`, which is a
      `bare` choice or a `signal` choice whose `value` is `null`. The decline is the only choice that continues the
      agenda, except that a branch-gone offer's other `bare` choices lead into the same held path (§ 5.3).
    - **`ask: "orientation"`** — a standing offer shown at its place in orientation, among the renders, with its
      choices and their commands: cleanup remedies, routes, the housekeep soft offer. The person may pick one in reply
      to the orientation; its actions run then and its `then` applies. Not picking is the decline, so no `decline`
      choice is required, and nothing is recorded.
- **`fragment`.** A method `name` is one the spine declares in `arc.methods`; a workflow `path` is a shipped workflow
  the compiler derives from the subject or the row (§ 5).
- **`render`** and **`note`.** `surface` is a surface id from § 6. `text` is CLI-composed and emitted verbatim. A
  `render` is a conditional top-level section of the orientation, above the work state; a `note` is one line among the
  orientation's advisory lines.
- **`gate`.** At most one, and last. `autoProceed` is false unless `kind` is `proceed` (§ 4.10).
- **The last step** is a `gate`, an `exec`, a workflow `fragment` (that workflow then owns the session), or an
  `ask: "now"` offer every choice of which recompiles or hands off.

#### 3.3 Payload reuse

Text is the composer's own (`recommendedPromptText`, `deliveryPosition.value.line`, `register.text`, a remedy's `text`),
and each executable action is a published `SessionAction` or one the compiler composes from slot fields and Git facts
(§ 4.8). No new `recommended*Text` field name is introduced.

### 4. Executing an agenda

#### 4.1 Order

The agent executes steps in order. The compiler sequences every sync operation before the reads that depend on it, so
steps carry no ordering fields.

The agent emits the orientation once per agenda, at its last step: before a `gate`, or before a workflow `fragment` that
then owns the session, which reports what its own entry establishes — for an Errand, `arc errand open`'s result. An
agenda that ends in an `exec` or an `ask: "now"` offer emits none; the agenda after it orients. The orientation carries
every `render`, `note`, and `ask: "orientation"` offer at its place, and the report of any method `fragment` the agenda
followed; that method's question is the gate's. For a method fragment the compiler omitted as followed earlier, which
the `answered` note names (§ 4.6), the agent carries that method's report and question into the orientation, as it
carries reads (§ 4.5).

#### 4.2 Actions and choices

An `exec`, or a chosen `actions` choice, runs its actions in order, each in its `checkout` when present, else the
session's checkout. An action's argv is one command; it never chains. Every argv the agent runs, an action's or a
recompile's (§ 4.5), and the first invocation it builds from the skill's arguments (§ 9.1), reaches the command one
element per argument, never re-parsed, and an action runs in its `checkout` path as given: where the harness runs
commands through a shell, the agent quotes each element and the path whole, since they carry text the person typed and
branch names from the remote. The first invocation takes its elements from the skill's arguments as the person gave
them: each flag is one element; the value of `--plan`, `--errand`, or `--start` runs up to the next flag, none when a
flag follows at once, and is one element however many words it holds; every other word joins the positional seed, also
one element; and quoting the person typed is honored. A failed action stops for direction: the agent surfaces the
command and its output and runs nothing further. When every action succeeds, `then` applies: a recompile with its `argv`
(§ 4.5) or a handoff (§ 4.7). After a failure the person may have the action retried, or the session continue past it.
Continuing runs the step's or choice's recompile `argv` as carried, and none of the choice's remaining actions. An
`exec` is then recorded as done and an `ask: "now"` offer as answered (§ 4.6), so the next agenda omits it and reports
each sync the step ran or the choice accepted that its slot still recommends — a combined accept's unrun pull included —
as `sync-unsettled`. A choice that records nothing, a branch-gone teardown or any `ask: "orientation"` choice, leaves
its question standing, so it is asked again. A failed handoff leaves the session at its orientation.

Only the compiler composes a sequence of more than one action: the branch-gone switch (a fetch, then `git switch`),
the combined sync accept, and the pre-flip in-place materialize (§ 7.2). A published `actions` array is never a
sequence: every shipped one is a menu of alternatives (`exitActions`' materialize-here or release,
`markPausedWorkItem`'s resume or abandon), so each entry becomes its own choice.

#### 4.3 Reads

The agent loads `read-load-set` (§ 8.1) before the first `read` step and executes each read by its `readMode`,
issuing all reads of one `group` in one tool message. The compiler assigns groups so that each group's estimated
aggregate size stays under a fixed per-group budget, a constant in the compiler rather than a configuration key, so a
harness's per-result cap does not silently cut a batch. A read whose result reports truncation is continued as
`read-load-set` says.

The compiler emits only reads whose file exists. An expected file that is absent becomes a `note` at compile time,
except that:

- an absent WORKING-MEMORY is normal on a fresh repository and emits nothing;
- an absent SESSION-NOTES, when the notes channel offers no load that could restore it, becomes a `render` of the
  CLI-run `git log --oneline -10` of the session's checkout.

A read that fails at execution is surfaced and skipped.

#### 4.4 Failed slots

Only a failed `derivedLocusState` stops the session by itself (§ 2.2). Any other slot the compiler reads that fails
becomes a CLI-composed degraded-slot `render` (surface `degraded-slot`, carrying the slot name, error kind, and
message), counts as a surface for `autoProceed`, and supplies no `exec`, `offer`, relation, or cleanup authority; the
rest compiles from healthy slots. A missing identity is not a slot failure: `runSessionInitStatus` fails
`derivedLocusState` itself with `SessionIdentityMissingError`, so the session stops at the unavailable row, whose CLI
message names the missing identity.

#### 4.5 Recompile

A step or choice that recompiles runs the argv it carries, unchanged except for an `elicit` choice's appended answer, in
the session's checkout, even after an action ran in another, and starts the fresh agenda from its top. The compiler
carries the session's answers, completed `exec` steps, and followed method fragments in that argv (§ 4.6), so the agent
carries over only reads and a followed method's report (§ 4.1): a `read` step counts as done when the session already
read the same checkout and path and no sync since could have written it. A notes pull or load writes the user documents
(SESSION-NOTES, WORKING-MEMORY, USER-INBOX); a worktree pull, the superseded reset, or a materialize into the session's
own checkout writes the checkout's tracked files.

Each recompile costs one compile.

#### 4.6 Questions and answers

An offer's `id` names its questions. A question key is `<surface>:<action>` — the slot and the action it offers, for
example `worktree:pull`, `notes:pull`, `notes:load`, `base-sync:pull`, `superseded:reset`, `cold-start:scaffold` — with
a further segment where the question has an operand: `branch-gone:<kind>`, `materialize:<name>`, `plan-stub:<value>`. A
combined sync offer's `id` joins its channels' keys (`worktree:pull+notes:pull`). A refresh that changes the question
changes its key, so branch-gone's `pending` refreshed to `resolved` or `surface` is asked again, and a notes load is a
different question from a notes pull. An `exec`'s `id` is the key its action takes when offered — `notes:pull`,
`notes:load`, `base-sync:pull`, and `branch-gone:resolved` for the clean switch — or `user-references:apply`, so an id
holds across compiles.

The verb takes the session's answers as repeatable flags, `--answered <key>=accept|decline` and `--done <id>`, which
only the compiler writes. It builds each argv it emits from the answers it received plus what reaching that point
implies, by step and choice kind:

- **An `ask: "now"` offer's `actions` choice** records each key of the offer's `id` as `accept` when the choice's
  `accepts` lists it, else as `decline` — except a branch-gone teardown, which records nothing: when it succeeds it
  removes its candidate, and the cascade recompiled after it asks again over the candidates left (§ 5.3); after a failed
  teardown the session continued past, the same question stands (§ 4.2).
- **Every `ask: "now"` offer earlier in the same agenda** is recorded as `decline`, since its decline is the only
  choice that continues the agenda (a branch-gone `bare` choice compiles the same held path as its decline).
- **A `signal` or `elicit` choice** records nothing: the signal it sets or clears is the record, and its offer does not
  recur under the changed signals. The exception is a bare signal's decline, which records its offer's key as `decline`,
  so the `answered` note reports the declined pick above the arm the recompile reaches.
- **An `ask: "orientation"` offer** records nothing, whichever choice is picked; one still standing after a recompile
  is shown again.
- **An `exec`** records its own `id` as done.
- **A method `fragment` earlier in the same agenda** records `fragment:<name>` as done.
- **`read`, `render`, `note`, and `gate` steps** record nothing; reads carry over agent-side (§ 4.5).

On compile, the compiler emits no `ask: "now"` offer whose every key is answered, no `exec` whose `id` is done or
answered, and no method `fragment` recorded as done, so an action declined at an offer never runs later as an automatic
step, and Orient's `discover-next-work` does not run again after a pick at its orientation recompiles; an offer some of
whose keys are answered is emitted for the rest alone. A declined channel's state renders in orientation, as after any
declined offer, and an answered branch-gone question compiles the held path (§ 5.3). A sync step (§ 5.2) the session
accepted or ran, successfully or not, whose slot still recommends it gets a `note` (surface `sync-unsettled`) instead of
another step, and the agenda compiles on as if it were declined. A `note` (surface `answered`) names each offer answered
earlier and each method fragment omitted as followed, so orientation reports them (§ 4.1). An answered
`cold-start:scaffold` compiles straight to Orient however it was answered: an accept reaches a cold-start compile only
after a failed start the session continued past (§ 4.2), and that Orient runs without the seed the accept dropped. A
session therefore answers once each question its choice records, runs each `exec` once, and follows each method fragment
once. A question whose choice records nothing stands and is asked again under its key: a branch-gone cascade after a
teardown (§ 5.3), or a `plan-stub` question whose answer is again not found (§ 5.4).

#### 4.7 Handoff

An `exec` or choice whose `then` is `handoff` runs a command that leaves the work in another checkout. The agent relays
the command's own result text, which names that checkout (`arc materialize`'s report, `arc errand materialize`'s
`recommendedPromptText`), and stops; the work resumes in a fresh session there, whose init derives its frame from
recorded state. The running session moves into that checkout only on the person's explicit opt-in after hearing that
their terminal and editor stay on the current checkout, and then runs the spine afresh from there.

#### 4.8 Compilation follows sync

A worktree pull, a notes pull or load, a base-branch sync, and the superseded reset change what the compiler reads:
SESSION-NOTES, USER-INBOX, WORKING-MEMORY, the meta, the task list, the local base ref `readLocalBaseOid` reads for
`baseBranchSync`, and whether the advertised base object is present locally, which `analyzeBaseDistanceSnapshot` checks
for base drift. Every sync `exec` therefore carries a recompile `then`, and so does every offer choice that runs a
sync, the combined accept included. A declined sync offer leaves state as compiled; the channel's state still renders in
orientation.

The compiler composes the sync argv from slot fields: `git pull --ff-only` for the worktree channel, `arc user pull` for
the notes channel, `git fetch origin <base>:<base>` from `baseBranchSync.value.base` for the base branch, and
`git reset --hard origin/<branch>` from `worktree.value.branch` for the superseded reset. The user-reference apply
runs the slot's `recommendedCommand` unchanged; it compiles after the agenda's sync steps, so it runs on synced state,
and it recompiles, since it writes USER-INBOX fields and, after the flip, moves the per-work-unit personal folders that
hold SESSION-NOTES.

#### 4.9 Session-notes fields

The compiler reads SESSION-NOTES' `**Session Type:**` override and `**Commit at Handoff:**` itself, with `extractField`
(`lib/store/kinds/meta/line-reading.ts`) over `stripHtmlComments` (`lib/user-sync/parser.ts`) output, treating `[none]`
as absent and stripping inline code, as `foldImportSession` already reads both. Because compilation follows sync, it
reads them after any pull, so nothing the agent reads later can contradict a compiler input.

- **Session Type override.** Applies only to `planning | execution`, case-insensitive, and only when the derived
  `sessionType` is itself `planning` or `execution`; `prepublication` and `integration` stay state-determined. A
  conflicting or invalid value becomes a warning `note` and is ignored.
- **Freshness.** On a work-unit resume, and on `--start` from a work-unit checkout, where the note joins the readiness
  renders (§ 5.4): a `Commit at Handoff` equal to HEAD emits nothing. One that differs makes the compiler read the
  commits since it and whether the meta changed in that range, and emit one `note` (surface `freshness-gap`) carrying
  both. An absent hash — a first session, a crash, a clone without notes — emits the same note saying there is no
  handoff baseline. The freshness `git log` reads leave the spine.

After the flip both fields come from the meta's session-context section; that is a reader change in the compiler.

#### 4.10 Auto-proceed

`gate.autoProceed` carries `--next`. The compiler sets it on a work-unit resume's `proceed` gate only when `--next` was
passed and nothing it knows of would block a bare-clean orientation: no `render` or `note` step but `header` and the
`answered` note, and no `offer`, was emitted, the tree is clean, no freshness gap, no unconsumed seed or shortcut, and
no meta `**Blockers:**` value (`parseMetaRecord`'s `blockers`). The agent still withholds auto-proceed on a mismatch
(§ 9.1) or on a blocker its composed Blockers line carries from SESSION-NOTES, which the CLI does not parse. Only the
session's first orientation can auto-proceed: the argv an `ask: "orientation"` choice carries drops `--next`.

#### 4.11 Withheld actions keep their limits

Each surface's remedy becomes the step today's rule for that surface implies; § 6 enumerates the mapping. Two
invariants bind every row:

- Nothing today's workflow withholds from automatic execution becomes an `exec`: the offer-only
  `git reset --hard origin/<branch>`, a teardown never run automatically, and a rename move's `git worktree move` stay
  `offer` choices.
- Nothing withheld at init, forbidden, or left to an owner becomes an action; it renders as text: detection-only
  tracked edits, a channel whose pull is never offered, a `blocked` entry, a husk left to manual cleanup, an unmerged,
  non-shipped orphan branch, an adopted orphan kept for its owner, and a locked registration whose unlock belongs to
  the lock's owner.

A command a step offers or runs is the argv the CLI published, unchanged, or one the compiler composes from the slot's
fields and the Git facts it reads (§ 4.8, § 5.2). The compiler adds no flag a surface's rule forbids.

### 5. Compilation per entering row

#### 5.1 The entry prefix

A row that cites the **entry prefix** starts with it: its sync steps (§ 5.2), then the **universal reads** — both
briefs, both `DEV-RULES`, `STRATEGY-INDEX`, and `QUICK-REFERENCE` § Environment & Path Context in
`resolveLoadSetManifest`'s order, `AGENT-BRIEF.CONTRIBUTOR` when `identity.role` is `contributor`, and WORKING-MEMORY
whenever an identity resolves (the path the load set emits). Wherever the rest of a work unit's load set is read — a
work-unit resume, or branch-gone's held path (§ 5.3) — WORKING-MEMORY instead takes its manifest place after the meta
and SESSION-NOTES (§ 5.6). The prefix runs the notes channel alone on the signal rows (`--errand`, `--housekeep`,
`--plan`, `--context`) and on `--start`, and every channel on transient resumes, work-unit resumes, a contextless husk,
and Orient.

Every row carries the prefix except the stops, cold-start before its decline, and rows whose agenda ends in a recompile
or a handoff before any read, whose next agenda carries it. So the always-loaded set loads however `arc-session` is
invoked. A positional seed, `--next`, or `--start` the row does not consume becomes a `note` (surface
`unconsumed-signal`): for a positional seed, that starting fresh work from it means spawning or checking out a new
worktree and entering there; for `--next`, that it auto-proceeds only a work-unit resume; for a `--start <slug>` a
signal row outranks, that `arc-session --start <slug>` run on its own vets that launch. Stops and branch-gone's held
path emit none, since the checkout's own state comes first.

#### 5.2 Sync steps

The prefix compiles each channel's published recommendation; its offers, like § 5.3's, § 5.7's, and a bare signal's
pick, ask now. Automatic syncs come first: the compiler emits the first automatic sync `exec`, in the order notes pull,
notes load (§ 7.1), base-branch sync, and nothing after it. With none, it emits the sync offers in the order superseded
reset, worktree and notes (one combined offer when both would be offered), notes load, base-branch sync; then the
user-reference `exec` when that slot recommends `apply` and the session has not run it, which ends the agenda; otherwise
the reads.

| Channel                                    | `recommendedAction` → step                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Worktree (`worktree.value`)                | `prompt` → offer `worktree:pull`, text `recommendedPromptText`, accept runs                  |
|                                            | `git pull --ff-only`; `surface` → its orientation surface (§ 6); `skip` → nothing            |
| Superseded (`worktree.value.supersession`) | `superseded === true` on a `diverged` worktree → offer `superseded:reset` (below); declined, |
|                                            | or on any other row, the `superseded` surface's head alone                                   |
| Notes (`user.value`, before the flip)      | `pull` → `exec` `arc user pull`; `prompt` → offer `notes:pull`; `surface` → its              |
|                                            | orientation surface; `skip` → nothing                                                        |
| Worktree + notes                           | both `prompt` → one offer `worktree:pull+notes:pull`, text `recommendedCombinedPrompt`,      |
|                                            | choices pull both / worktree only / notes only / skip                                        |
| Notes load                                 | § 7.1                                                                                        |
| Base branch (`baseBranchSync.value`)       | `pull` → `exec` `git fetch origin <base>:<base>`; `prompt` → offer `base-sync:pull` of the   |
|                                            | same argv, never combined; `surface` → the `stale-base` surface; `skip` → nothing            |
| Base distance (`baseDistance.value`)       | `surface` → the `base-drift` surface; `skip` → nothing                                       |
| User references (`userReferenceReconcile`) | `apply` → `exec` of `recommendedCommand` (id `user-references:apply`); `surface` → the       |
|                                            | `user-references` surface; `skip` → nothing                                                  |
| Store user slot (after the flip)           | the store's pull already ran in the probe (§ 2.4); its `summary` is a `note` (surface        |
|                                            | `store-sync`) unless the pull was a no-op, and its `actions` render as text                  |

When another pair of sync offers would both be emitted — worktree and a notes load, say — the compiler likewise emits
one combined offer whose `id` joins their keys, whose text joins each channel's text, and whose choices are each
channel alone, all together, and decline.

**The superseded reset.** The supersession analyzer proves the local commits patch-equal to a prefix of
`origin/<branch>` for the local branch name (`worktree.value.branch`); the reset targets that same ref. The offer's text
is composed by `composeSupersessionPromptText`, changed so the envelope's text matches: the head "Local commits are
superseded by rebased equivalents on `origin/<branch>`; dropping them loses nothing.", on a dirty tree "Working tree
dirty — the reset discards uncommitted changes; stash them first (a commit made now would be dropped too).", then the
question carrying `git reset --hard origin/<branch>`. The pull's `DIRTY_TREE_WARNING` is not reused: its "commit before
accepting" is safe before a pull and loses a commit made before a reset. The offer appears ahead of the reads on rows
whose prefix runs the worktree channel; on other rows, and once declined, the `superseded` surface renders the head
alone, with no warning and no question.

#### 5.3 Branch-gone recovery

When `worktree.value.state === "branch-gone"`, the probe's `recovery` slot carries one of five kinds, each with
`recommendedAction` and `recommendedPromptText` (`inferBranchGoneRecovery`, `lib/session-init/recommended-action.ts`;
`resolveCascade`, `lib/session-init/branch-gone-cascade.ts`). The CLI publishes no switch or fetch argv for any of them,
so the compiler composes the switch.

**Destinations.** A switch destination is a candidate whose `proposedAction` is `switch` in a `resolved` or `surface`
result, or `main-fallback`'s `baseBranch`. `pending`'s and `unproven`'s candidates are not destinations. The compiler
locates a destination from the candidate's `worktreePath`, else from its own worktree-list read
(`resolveWorktreePathsByBranchResult`), and checks whether the branch has a local ref. A missing `worktreePath` never
means the branch is free: recent-branch candidates carry none, `main-fallback` carries only `baseBranch`, the roster is
empty before the flip when no checkout holds a meta, and team mode filters other identities' checkouts out of it.

- A **free** destination, checked out in no worktree, becomes the actions `git fetch origin <branch>` (only when the
  branch has no local ref) and `git switch <branch>`, with a recompile `then`.
- A destination **checked out elsewhere** is never switched to; it takes the **held path**.
- The **held path** — taken by a destination checked out elsewhere, a declined, deferred, or surface-only recovery, an
  answered recovery question (§ 4.6), a switch the session continued past after it failed (§ 4.2), an absent or failed
  `recovery` slot (the probe reads it only once the roster resolves; a failure renders as a degraded slot, § 4.4), and
  any bare choice — skips every sync step, reads the universal reads and, when the entering row selects a work unit, the
  rest of its load set as a resume does (§ 5.6), renders the `branch-gone` surface (§ 6) and the row's other orientation
  surfaces, and ends `gate stop`. The `branch-gone` render carries the recommendation's text, which already holds each
  `external` candidate's repair text; the checkout note of each destination checked out elsewhere ("Continue recovery in
  checkout `<path>`."); and each `missingFolders` entry's remedy text. All of it is composed from state, so the render
  reads the same whichever choice led there and after any recompile; with no `recovery` value it carries today's line
  alone.

| Kind / candidate                   | Action    | Steps                                                                                  |
| ---------------------------------- | --------- | -------------------------------------------------------------------------------------- |
| `resolved`, `switch`, clean tree   | `switch`  | free → `exec` (fetch if needed, switch) + recompile; elsewhere → held path             |
| `resolved`, `switch`, dirty tree   | `prompt`  | offer `branch-gone:resolved`, text `recommendedPromptText`: free → actions choice;     |
|                                    |           | elsewhere → a bare choice to continue there; decline → held path                       |
| `resolved`, `removable`            | `prompt`  | offer: the published `arc teardown <name>` action + recompile; decline → held path     |
| `resolved`, `external`             | `surface` | held path; the render carries the manual-recovery or checkout-repair text              |
| `surface` (two or more candidates) | `prompt`  | offer `branch-gone:surface`: per `switch` candidate as `resolved`; per `removable` its |
|                                    |           | teardown action + recompile; per `external` a bare choice; decline → held path         |
| `main-fallback`                    | `prompt`  | offer `branch-gone:main-fallback`: the base as a destination; decline → held path      |
| `pending`                          | `prompt`  | offer `branch-gone:pending`: the published refresh (`arc active in-flight --json`) +   |
|                                    |           | recompile; decline → held path. Its candidates are not offered                         |
| `unproven`                         | `surface` | held path; the render carries `recommendedPromptText`                                  |

A refresh that resolves the evidence changes the kind, and so the question key (§ 4.6); one that leaves it `pending`
finds its question answered and compiles the held path. A teardown records no answer (§ 4.6), so the cascade recompiled
after it asks again over the candidates left, at most once per removable candidate unless its teardown fails and the
session continues past it (§ 4.2). The spine has the agent report, in orientation, any branch-gone switch that ran
without an offer.

#### 5.4 Rows

| Row / signal                 | Steps                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| stops (§ 2.2)                | `render` the `locus` surface (§ 6.2); for a failed `currentHusk`, its degraded-slot       |
|                              | `render` (§ 4.4); `gate stop`                                                             |
| branch-gone                  | § 5.3                                                                                     |
| `--errand --next`            | prefix; the compiler resolves the queue head as `arc errand next --json` does: available  |
|                              | → `render` of its `recommendedPromptText`, checkout renders, `fragment` `run-errand`      |
|                              | (`mode: "launch"`, `fromInbox` the offer's key, `isolate`); empty → `render` +            |
|                              | `gate stop`; refused → `render` of reason, remedy, and retry command + `gate stop`        |
| `--errand <seed>`            | prefix, checkout renders, `fragment` `run-errand` (`mode: "launch"`, `seed`, `isolate`);  |
|                              | a seed naming a flagged `§ Errand` capture passes it as `fromInbox`                       |
| `--errand` bare              | prefix, then offer `errand:pick`: a `signal` choice per `§ Errand` capture flagged        |
|                              | `_Remind:_` or `_Hold:_` (`extractReminderEntries`), an `elicit` choice for a new         |
|                              | concern, and a decline that clears the signal, and `--isolate` with it, and recompiles    |
| `--plan <stub>`, found       | prefix, checkout renders, `fragment` `draft-design` (`stub`, `onGroomingBranch`)          |
| `--plan` bare or not found   | prefix, then offer `plan-stub:<value>`: an `elicit` choice carrying any unmatched value,  |
|                              | and a decline that clears the signal and recompiles; an answer still not found is asked   |
|                              | again under its own key                                                                   |
| `--housekeep`                | prefix, checkout renders, `fragment` `drain-inbox` (no arguments)                         |
| `--start <slug>`, resolved   | prefix, target meta and task-list (when present) `read`s, readiness renders (dirty tree,  |
|                              | the freshness note (§ 4.9), the worktree's states and `stale-base` as readiness input,    |
|                              | never a sync step, the notes channel's surfaces, and the concurrent-workload note),       |
|                              | `fragment` `assess-start-readiness`, `gate launch`                                        |
| `--start <slug>`, unresolved | the target state as a `note` (surface `start-target`), then the entry row as if absent    |
| `--context`                  | prefix, checkout renders, `gate stop`                                                     |
| transient resume             | prefix, checkout renders, `fragment` of the subject's owning workflow (`subject` kind and |
|                              | key, `generation` the marker generation, and `mode: "resume"` for `run-errand`)           |
| work-unit resume             | prefix, the rest of the load set's `read`s (§ 5.6), renders, `gate proceed`               |
| contextless current husk     | prefix, the `husk` surface and other renders, `gate stop`                                 |
| cold-start                   | `fragment` `in-flight-scope-check` (advisory), offer `cold-start:scaffold` (§ 5.7);       |
|                              | decline → the Orient steps; answered (§ 4.6) → the Orient row alone, without the scope    |
|                              | check                                                                                     |
| Orient                       | prefix, `fragment` `discover-next-work`, renders with the route offers (§ 5.8),           |
|                              | `gate stop`                                                                               |

- **The signal workflows own their entry.** `run-errand`'s Launch mode classifies the concern, runs the advisory
  overlap check, and invokes `arc errand open` itself — with `--isolate` when passed and `--from-inbox` for an adopted
  capture — then works from the returned `allocation.checkoutPath`; `drain-inbox` and `draft-design` run their own
  write-context preflight and relocation. Session-init no longer invokes `arc errand open` itself.
- **`--context` is a new arm.** It loads the universal context and orients on the checkout without entering work: no
  discovery, and no work-unit artifact or surface, even on a work-unit checkout. It is the one arm this change adds.
- **Orientation shape.** The compiler sets `orientation` from the row: `none` on the stops; `work-state` on a
  work-unit resume, a contextless husk, cold-start, and Orient; `checkout` under `--context`; and `subject` on the
  `--errand`, `--housekeep`, and `--plan` rows, a transient resume, and `--start`, whose subject is the Errand (its seed
  or queue key, `null` while unpicked), the grooming stub, the housekeep sweep (`key: null`), the transient subject, or
  the `--start` target (`kind: "work-unit"`). Branch-gone takes its entering row's shape: `subject` on a transient row,
  with that row's subject, and `work-state` otherwise.
- **Bare `--errand` and `--plan` resolve at compile.** The closed part of the choice set is known to the CLI — the
  flagged captures `extractReminderEntries` returns, and a seed's stub from `resolveBacklogStub`, which matches exact
  slugs — so no arm workflow elicits. A lookup that fails (two stubs matching in one state directory, an unreadable
  backlog directory, or a store refusal) compiles as not found, and the `plan-stub` offer's text names the failed lookup
  and its message, so the person can give another stub or decline.
- **`--start` target.** It resolves the slug as `arc status <slug>` does (`handleLifecycleStatus`,
  `handlers/status/lifecycle.ts`), checking lifecycle quality first. A slug the composed index marks indeterminate
  (`isComposedLifecycleSlugIndeterminate`, which `arc start` checks before minting a branch), or one the store refuses
  other than as `not-found`, is unresolved, its note naming the warning or refusal; ambiguity (`location-ambiguous`,
  `ambiguous-match`) is one such case. Otherwise a `provisional` or `planned` target resolves, and the rest are
  unresolved: `nonexistent` is missing; `planning`, `active`, `integrating`, and `parked` are started; `shipped` is
  terminal.
- **`onGroomingBranch`** is true when the checkout's branch is `chore/groom-<stub>`. `draft-design`'s entry check runs
  whenever it is false (§ 12).
- **The owning workflow** of a transient subject is recovery's mapping (`transientWorkflow`,
  `lib/recover/locus-context.ts`): `run-errand` for `errand` and `partial-errand` in resume mode, `draft-design` for
  `groom`, `drain-inbox` for `housekeep`. Partial Errands stay marker-derived and identity-independent.
- **Cold-start** is the `unmanaged-checkout` row on a linked checkout (`checkout.primary === false`) with a branch
  checked out. Every other `free-primary`, `unmanaged-checkout`, or `retired` row is Orient.
- **`discover-next-work`'s arguments** are `pmMode` (`config.value.settings["pm.mode"]`), `protection`
  (`branch.protection`), and `seed` when a positional seed is present; a seed naming a backlog work unit pre-focuses it
  with a confirm-only init offer.

#### 5.5 Checkout renders

**Checkout renders** are the orientation's checkout-local surfaces — hooks path, the worktree channel's behind,
diverged, superseded, local-ahead, no-upstream, detached-HEAD, no-remote, and remote-unavailable states, dirty tree, the
notes channel's surfaces, base drift, stale base, and the degraded-slot lines of the slots these draw on. The
`--errand`, `--housekeep`, `--plan`, and transient rows emit these framed on `orientation.subject` (the Errand, drain,
or grooming target), and `--context` under its `checkout` shape; none of them emits discovery routes, reminders, or a
work-unit surface. `currentWuReconcile`, `deliveryPosition`, the in-flight work-unit routes, and the cleanup lists are
never checkout renders.

#### 5.6 The work-unit resume's reads

The rest of the selected context's load set, in `resolveLoadSetManifest`'s order: the meta, SESSION-NOTES,
WORKING-MEMORY, then the workflow the session type and stage select — for task work, on execution or integration, the
task list and then `process-task-loop` — and last the cohort document. A valid Session Type override (§ 4.9) recomposes
the load set through `resolveLoadSetManifest` with the overridden `sessionType` and the planning and work-unit stages
re-derived from it (`resolvePlanningStage`, `projectWorkUnitStage`), so the reads match it.

The task-list `read` keeps today's skips: none in planning, and none when `taskCursor` is `missing` or `no-open-task`.
When the cursor is `found`, the step carries it as `cursor`. A malformed cursor or a failed cursor probe skips the read
with a diagnostic `note`; a located cursor whose section the agent cannot find is a mismatch (§ 8.1). A null workflow
on a selected role is a mismatch `note`.

#### 5.7 Cold-start

The offer's text shows the seed's resolved disposition, so the person confirms the reading, not just the act: an issue
reference becomes the meta's `Origin`; any other seed — a `draft-` or `spec-` pointer, a file or URL, a free-text blurb
— passes through for planning. Its accept runs `arc start --here --from <seed>`, or bare `arc start --here` with no
seed, and recompiles without the seed. After a successful start the recompiled agenda is a work-unit resume. After a
failed start the session continued past that left the checkout unmanaged — refused before it committed, or its scaffold
rolled back — the checkout is still cold-start, and the answered offer compiles straight to Orient without the seed
(§ 4.6). A start that failed after committing, such as a refused marker binding (`stampCreatedWorkUnitMarker`), leaves
the work unit live with an unbound claim, and the recompile stops on that checkout (§ 2.2).

#### 5.8 Route offers and materialize

On Orient the compiler emits these as `ask: "orientation"` offers at their surfaces' places (§ 6.2), in order:

- **Materializable work units** (`materializableWorkUnits.value.candidates`): one offer, `materialize:<names>`, with a
  choice per published action of each candidate. A choice that materializes or starts work in another checkout hands
  off: the spawning `arc materialize <name>`, or on the store path a `--here` exit whose `checkout` is another holder's.
  Every other choice recompiles: `arc materialize <name> --here` and `arc start --new --here` in the session's own
  checkout, and `arc locus release` wherever it runs, since it only frees that checkout. Before the flip the offer adds
  one in-place choice per candidate (§ 7.2). `refreshRemedy`, when present, is its own choice and recompiles.
- **Materializable Errands** (`errandState.value.materializable.candidates`): one offer with a choice per candidate
  running `arc errand materialize <slug> --claim-id <claimId> --expected-head <expectedHead> --json` and handing off.
  The verb's own refusal on head drift or a change-request mismatch stops as any failed action does.
- **Housekeep** (`inboxState.value.housekeepNeeded`, primary checkout only): one offer whose accept is a `signal`
  choice for `housekeep`, a soft offer the person may decline.

An Errand materialize no longer runs today's in-session checks of outcome, identity, allocation, and the re-probed
checkout: they guarded a continuation in this session, which the handoff removes, and the fresh session's init resolves
the materialized checkout from recorded state.

### 6. Orientation surfaces

Every surface is composed CLI-side. The agent composes only the thought-state lines — Last completed, Current task,
Blockers, Next action — from the meta and SESSION-NOTES, and, when it bears on the current task, a cohort-coordination
line from the cohort document the load set read. Where today's workflow has the agent fill a template from slot fields,
the compiler fills the same template from the same fields; the template text is `session-init.md`'s at the base this
change starts from. Where the CLI already composes the text, the step carries it verbatim. Where today's workflow has
the agent report a state in its own words — the worktree's behind and remote-unavailable states and a pending notes load
— the compiler composes the line its § 6.2 cell gives, from the same fields.

#### 6.1 Limits

Every action limit in the table withholds an authorization — the person's decision to run a destructive, irreversible,
or owner-held command — so each is an invariant under `DEV-RULES.ARC` § Rule Authority's backstop, held by the person
or the named owner. The compiler holds it by construction (§ 4.11): such a remedy is at most an `offer` choice, or text.
Presentation rules — verbatim, once, in order, omit when empty — are defaults the compiler implements. "Advisory, never
gates" means the surface is a `render` or `note` and blocks nothing but `autoProceed`.

#### 6.2 Mapping

Steps render in the table's order, which is today's order of conditional sections. "Offer" means one
`ask: "orientation"` offer at the surface's place, with one choice per listed remedy, unless the cell names a § 5 offer;
"text" means the remedy's own `text` inside the render. A remedy without `argv` is always text. A choice of one of these
offers recompiles, since its command changes what the sweeps report, except one that removes the session's own checkout
or spawns another, which hands off: the `husk` teardown and a retirement successor's `arc start`. A channel is
**unsynced** where no step on the path that reaches the render syncs it: its policy is `manual`, its offer was declined
in an earlier agenda or earlier in the same one, whose decline is the only way on (§ 3.2), or the row's prefix skips the
channel (§ 5.1).

| Surface id                    | Source and condition                                    | Step and text                                          | Remedy shapes → handling                          |
| ----------------------------- | ------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `header`                      | every orientation but a stop's                          | render: today's header line, branch and clean or dirty | none                                              |
|                               |                                                         | from `worktree` and `dirty`, plus the worktree path    |                                                   |
|                               |                                                         | when `worktree.value.identity.kind === "linked"`       |                                                   |
| `delivery-position`           | `deliveryPosition.ok` and `value !== null`              | render `value.line` verbatim, once                     | none                                              |
| `locus`                       | `locusGuidance` `unavailable` (a stop) or `ready`       | render `message`, or the present `pause`,              | none; text only                                   |
|                               |                                                         | `primaryAvailability`, `identityDiscovery`,            |                                                   |
|                               |                                                         | `cleanup[]`, `diagnostics[]`; on a stop whose guidance |                                                   |
|                               |                                                         | is `ready`, also `entering` and the compiler's line    |                                                   |
|                               |                                                         | that no work-unit context resolves for the checkout;   |                                                   |
|                               |                                                         | otherwise `entering` is the frame, named by the header |                                                   |
| `degraded-slot`               | a probe-wrapped slot other than `derivedLocusState`     | render slot name, `error.kind`, `error.message`        | the slot supplies no action                       |
|                               | with `ok === false`                                     |                                                        |                                                   |
| `worktree-diverged`           | `worktree` `diverged`, not superseded                   | render today's `**Reconcile required:**` line          | none; never auto-reconciled                       |
| `superseded`                  | `worktree` `diverged`, `supersession.superseded`        | offer (§ 5.2) on resume and Orient rows; else, or      | composed reset → offer only                       |
|                               |                                                         | declined, render the head                              |                                                   |
| `branch-gone`                 | `worktree` `branch-gone` on the held path               | render (§ 5.3) with today's `**Branch gone:**` line    | § 5.3                                             |
| `local-ahead`                 | `worktree` `local-ahead`                                | render today's `**Local-ahead:**` line                 | none                                              |
| `worktree-behind`             | `worktree` `remote-ahead`, unsynced                     | render: behind by `behind`, pull when ready            | none; no pull                                     |
| `worktree-remote-unavailable` | `worktree` `remote-unavailable`                         | render: remote unreachable, sync state unknown         | none                                              |
| `base-drift`                  | `baseDistance` `surface`                                | render `recommendedPromptText` verbatim                | none; advisory                                    |
| `stale-base`                  | `baseBranchSync` `surface`; or behind, unsynced, and    | render `recommendedPromptText` verbatim on `surface`,  | `refreshRemedy` → text, advisory                  |
|                               | checked out in no worktree (`checkout.kind`             | else the behind-only text                              |                                                   |
|                               | `not-checked-out`)                                      | `composeBaseBranchSyncBehindText` composes             |                                                   |
| `current-wu-reconcile`        | `currentWuReconcile.ok`, `surface` (work-unit resume)   | render `recommendedPromptText` verbatim                | `recommendedCommand`, `actions` → text: tracked   |
|                               |                                                         |                                                        | edits apply in their own review increment         |
| `user-references`             | `userReferenceReconcile.ok`, `surface`                  | render `recommendedPromptText`                         | inspect and scratch `actions` → text; `apply` is  |
|                               |                                                         |                                                        | the § 5.2 `exec`                                  |
| `hooks-path`                  | `hooksPath.ok`, `surface`                               | render `recommendedPromptText` verbatim                | none; advisory                                    |
| `notes-lag`                   | `partialPushMarker.value.markers` non-empty             | render today's `**Notes lag:**` lines from each        | none; never force-push                            |
|                               |                                                         | marker's commit, timestamp, and machine                |                                                   |
| `notes-compaction`            | `compactionAdvisory` `shouldSuggest` and `shouldNudge`  | render today's line naming `arc user compact`, with    | the command → text; never run                     |
|                               | (primary only)                                          | the nudge marker                                       |                                                   |
| `notes-reconciling`           | `user` `conflict`, `contentRelation` `local-subset`,    | render today's `**Notes reconciling:**` line           | none; no pull offered                             |
|                               | `equal`, or `mixed-uncontested`                         |                                                        |                                                   |
| `notes-conflict`              | `user` `conflict`, any other relation                   | render `user.value.summary` and `detailLines`          | none; no pull offered                             |
| `local-ahead-notes`           | `user` `clean` and `local-ahead`, or `diverged` with    | render today's `**Local-ahead notes:**` line           | none                                              |
|                               | `remote-subset`                                         |                                                        |                                                   |
| `notes-behind`                | `user` `remote-ahead`, unsynced                         | render `user.value.summary`                            | none; no pull                                     |
| `notes-remote-unavailable`    | `user` `remote-unavailable`                             | render `user.value.summary`                            | none                                              |
| `notes-drift`                 | `user.value.notesDriftSurface`, `expected` or `caution` | render today's line for the register with `direction`  | none; never loads                                 |
| `notes-load-pending`          | `loadNeeded`, unsynced                                  | render: disk lags the latest note; `arc user load`     | the command → text                                |
| `store-sync`                  | the store user slot, after the flip                     | note `summary` unless the pull was a no-op             | `actions` → text                                  |
| `no-upstream`                 | `worktree` `no-upstream`                                | render today's `**New branch:**` line                  | none                                              |
| `husk`                        | `currentHusk.ok`, `value !== null`                      | render today's `**Husk:**` line by `stamp.kind`;       | `current`, `legacy`: offer the composed           |
|                               |                                                         | suppresses `detached-head`                             | `arc teardown <name> --husk <path>`, run from the |
|                               |                                                         |                                                        | primary checkout, and hand off; `legacy`          |
|                               |                                                         |                                                        | grants no remote deletion; `manual-only`: the     |
|                               |                                                         |                                                        | reason, no command                                |
| `detached-head`               | `worktree.value.branch === null`, no husk               | render today's `**Detached HEAD:**` line               | none                                              |
| `no-remote`                   | `worktree` `no-remote`                                  | render today's `**No remote:**` line                   | none                                              |
| `dirty`                       | `dirty` `dirty`                                         | render today's `**Uncommitted changes:**` line         | none                                              |
| `retirements`                 | `sweep.value.retirements` non-empty                     | render today's `**Landed retirement cleanup:**` list   | `actionable` `teardown` → offer, never automatic; |
|                               |                                                         |                                                        | a non-null successor `remedy` → offer; successor  |
|                               |                                                         |                                                        | `candidates` → text, no default; `blocked` →      |
|                               |                                                         |                                                        | text with its reason, no action                   |
| `rename-moves`                | `sweep.value.renameMoves` non-empty                     | render each `remedy.text`                              | `remedy.argv` (`git worktree move -f -f`) →       |
|                               |                                                         |                                                        | offer, run unchanged from outside the source      |
|                               |                                                         |                                                        | checkout; text when the session is in it          |
| `stale-worktrees`             | `sweep.value.worktrees` non-empty (primary)             | render today's `**Stale worktrees:**` list, labelled   | removable `teardown` or `actions` → offer; a      |
|                               |                                                         | by report `kind`                                       | removable husk's `arc teardown <name>` or         |
|                               |                                                         |                                                        | `--branch <ref>` → offer; `blocked`, `external`,  |
|                               |                                                         |                                                        | errand husks, `pre-store-husk`, `outside`, and    |
|                               |                                                         |                                                        | text-only `actions` → text; never `--force`       |
| `missing-folders`             | `sweep.value.missingFolders` non-empty (primary)        | render each entry's remedy text                        | text only; unlock belongs to the lock's owner     |
| `branch-orphans`              | `orphanBranchSweep.value.orphans` non-empty (primary)   | render today's `**Branch orphans:**` list              | shipped: `teardown` or `actions` → offer;         |
|                               |                                                         |                                                        | merged: the published `git branch -D` → offer,    |
|                               |                                                         |                                                        | adopted ones included; `evidence-unavailable` and |
|                               |                                                         |                                                        | unmerged orphans → text, never an action          |
| `cleanup-residues`            | linked checkout, `sweep.value.worktrees` or orphans     | render today's `**Cleanup residues:**` list            | a work-unit husk's published `--husk` argv →      |
|                               | non-empty                                               |                                                        | offer; branch and errand husks, `manual-only`,    |
|                               |                                                         |                                                        | dirty, or moved husks → text; reports and orphans |
|                               |                                                         |                                                        | as above; writes no marker                        |
| `retired-subdirs`             | `retiredSubdirs` `surface`, or its load unsynced or     | render today's `**Retired subdirs:**` list             | the command → text                                |
|                               | left by a declined notes pull (§ 7.1)                   |                                                        |                                                   |
| `reminder`                    | `errandSweep.value.stale` non-empty and                 | render today's `**Reminder:**` list, with the nudge    | none; never auto-removed                          |
|                               | `errandState.value.nudge.shouldNudge` (primary)         | marker                                                 |                                                   |
| `in-flight-work-units`        | `workUnitState.value.inFlight.workUnits` non-empty      | render today's list; `stale` entries only when         | `actions` → text; `mergeabilityGuidance`          |
|                               |                                                         | `workUnitState.value.nudge.shouldNudge`, with the      | verbatim; never merge, switch, or archive         |
|                               |                                                         | nudge marker                                           |                                                   |
| `materializable-work-units`   | `materializableWorkUnits.value.candidates`, Orient      | offer (§ 5.8) and render the list                      | § 5.8                                             |
| `materializable-errands`      | `errandState.value.materializable.candidates`, Orient   | offer (§ 5.8) and render the list                      | § 5.8                                             |
| `housekeep`                   | `inboxState.value.housekeepNeeded`, Orient, primary     | offer (§ 5.8), text today's `**Housekeep:**` line      | soft offer                                        |
| `concurrent-workload`         | `inFlightComposition` with `heavy ≥ 1` or `novel ≥ 1`   | note today's line, omitting a zero class               | none; never reorders or gates                     |

Notes the compiler emits for its own findings: `freshness-gap` (§ 4.9), `session-type-override` (§ 4.9),
`unconsumed-signal` (§ 5.1), `start-target` (§ 5.4), `domain-rules` (each `domainRules.value.warnings` entry),
`task-cursor` (§ 5.6), `missing-file` (§ 4.3), `answered` and `sync-unsettled` (§ 4.6), and the `notes-history`
render of `git log --oneline -10` (§ 4.3).

#### 6.3 Changes from today's text

- **Merged orphan branches** take the published `git branch -D`, not today's prose `git branch -d`.
  `withOrphanActions` publishes `-D` only once `orphanWorkLanded` finds every patch landed in the base (strict
  `git cherry` on the exact-evidence path) and no merge commit on the branch; `-d` refuses after a squash landing. An
  unmerged, non-shipped orphan stays text, never `-D`.
- **Stale branched worktrees** offer the sweep's own remedy. Today's prose falls back to a plain `git worktree remove`;
  the sweep already publishes `arc teardown <name>` for a removable report, or downgrades one with no name to `external`
  (`inspectBranchedRemoval`).
- **Missing-folder registrations** (`sweep.value.missingFolders`, and branch-gone recovery's own) render their remedy
  text. Today's workflow reads neither field.
- **Header and locus.** The header names the checkout, so `locusGuidance.entering` is not a line, except on a stop,
  which has no header (§ 6.2); today's rule to omit the section "when no lines remain" never fired, since `entering` is
  always set. A contextless work-unit stop adds the compiler's line that no work-unit context resolves for the
  checkout.
- **The notes load** follows the retired-subdir slot's published `prompt` on a dirty tree under `always`, where today's
  prose loads unless the dirt touches the user directory; and a notes pull, which performs the load itself, suppresses
  it, so a declined pull leaves the retired-subdir reconcile to its render rather than loading anyway (§ 7.1).
- **Signal rows orient before their workflow's entry.** Orientation comes at the agenda's last step, before the
  session-owning `fragment` (§ 4.1), so an Errand's orientation precedes `arc errand open` and `run-errand` renders the
  open's result, which names the opened checkout (§ 12); today the orientation follows the open. The checkout renders
  describe the checkout the session starts in.
- **Not rendered, as today:** `pausedWork` and `inboundBackPressure`, dormant before the flip; `errandState`'s
  `resume`, `inFlight`, and `residue`; other slots' `warnings` arrays (`domainRules`' become notes, § 2.3).

### 7. The cutover module

This change lands before the flip, so the notes channel, the notes load, and the notes surfaces (notes lag, compaction,
notes/disk drift, notes reconciling, local-ahead notes) still exist when it lands. The compiler builds all of them in
one module, so the cutover deletes that module rather than editing the compiler. Two of its pieces are new composition.

#### 7.1 The notes load

One `arc user load` when `user.value.loadNeeded === true` or `retiredSubdirs.value.recommendedAction` is `pull` or
`prompt`; the single load satisfies both. Neither firing means no load.

A notes pull suppresses the load. `loadNeeded` never co-occurs with a pull, since the pull fires only when the remote
notes ref is ahead (`inferUser`; a diverged ref is surfaced, never pulled) and `loadNeeded` only when the ref is
current. The retired-subdir trigger is independent of notes freshness and can co-occur, but `runUserPull`
(`commands/user/push-fetch.ts`) ends in `runUserLoad`, so a pull already performs the reconcile. While the notes channel
recommends a pull, by `exec` or offer, the compiler emits no load step; when that pull is declined, the
`retired-subdirs` render carries the reconcile's command (§ 6.2).

Otherwise the step follows `session.init_load.notes`:

- **`always`** → an `exec` (id `notes:load`) with a recompile `then` — unless the retired-subdir slot fired and
  publishes `prompt`, which `inferRetiredSubdirs` does on a dirty tree, and then the `prompt` arm below. A `loadNeeded`
  load alone never degrades: `resolveCleanArmNotesVerdict` sets `loadNeeded` only when the load overwrites nothing
  local, and today's degrade test — dirt intersecting the user directory in `git status --porcelain` — can never fire,
  since `.gitignore` ignores `.arc/user/*/`. `arc user load`'s pre-load backup stays the safety net for the
  retired-subdir reconcile.
- **`prompt`** → an offer `notes:load`. Its text is `retiredSubdirs.value.recommendedPromptText` when that slot fired,
  which carries the dirty-tree warning when it applies, else the compiler's: "Notes: local notes are current but disk
  lags the latest note. Load?" `loadNeeded` is a bare boolean, so the compiler composes the argv and that text.
- **`manual`** → the `notes-load-pending` render for a `loadNeeded` load, and the `retired-subdirs` render when the
  retired-subdir slot recommends `surface` (§ 6).

#### 7.2 The in-place materialize before the flip

Before the flip `findLegacyMaterializableWorkUnits` publishes only a spawning `arc materialize <name>`, so the
materialize offer adds one choice per candidate that runs `arc materialize <name> --here` in the session's own checkout
and then `arc user pull`, and recompiles, as today's explicit in-place materialize does. On the store path the published
`--here` actions recompile with no pull.

#### 7.3 What the flip still rewrites

The cutover's own rewrite of session-init shrinks to the SESSION-NOTES reads, since session notes come from the meta's
session context after the flip: the spine's SESSION-NOTES authority boundary, which covers its thought-state lines (§ 6)
and the Blockers line it withholds auto-proceed on (§ 4.10); `assess-start-readiness`'s check that the seeded
mini-handoff landed (§ 8.2), which then reads the spawned work unit's session context; the compiler's SESSION-NOTES
field reader (§ 4.9); and § 4.3's `git log` render for an absent SESSION-NOTES, which then fires on an empty session
context. It also rewrites `discover-next-work`'s `.arc/backlog/` and `.arc/active/` reads, since discovery then reads
the projected backlog or a list verb.

### 8. Methods

Each arm that needs agent judgment is a method. An arm that enters an existing workflow — `run-errand`, `drain-inbox`,
`draft-design`, `in-flight-scope-check` — names it by path instead. Each new method:

- is declared in the spine's `arc.methods` and named by a `fragment` step, or, for `read-load-set`, loaded at the
  spine's read-step rule;
- ships through an `init-recipe.json` `include_files` entry in both copies' install set;
- is classified Configurable in `CONFIGURABLE_FILES` (`classification.ts`);
- gets a row in `strategy-session-operations.md` § Method Classification by Trigger.

`assess-parallel-fit.md`, which `discover-next-work` fires, and `in-flight-scope-check.md`, which cold-start names, ship
nowhere today; each gains an `init-recipe.json` entry, and `assess-parallel-fit.md` a `CONFIGURABLE_FILES` entry.

The methods are public and project-overridable like any other, carry the ordinary method shape, and sit in the flat
methods directory. A method carries judgment and interaction and dispatches only on fields the CLI computed;
`assess-start-readiness`'s own readiness reads are the one residual (§ 8.2). A constraint that binds a single arm lives
in that arm's method, which loads exactly when the arm fires; a constraint spanning arms stays in the spine.

#### 8.1 `read-load-set`

The read contract: executing `full`, `partial-section`, and `partial-strategic` reads; read groups, one tool message per
group; manifest order as context order, however the reads complete; and continuing a read whose result reports
truncation (re-read the remainder by offset rather than accept the cut). `partial-strategic` has one procedure for both
consumers, today's recovery slicing moved here: the header above the first `## **Phase` heading; the current phase
preamble, from the phase id derived by stripping the leaf segment of `section.id` (`5.3` → `5`, `3.R.e` → `3.R`), read
from `## **Phase {id}:**` through the line before the first checkbox under it; and the current task section, from
`section.lineHint`, falling back to the section id and then the title, through the line before the next parent task or
phase heading, with `leaf` identifying the executable checkbox. One structural map of phase and task headings serves
any offsets needed.

- **Init** takes the anchors from the `read` step's `cursor`. It no longer anchors on the meta's `**Next Task:**`
  triple. A task section that cannot be located skips the read and is surfaced as a mismatch (§ 9.1).
- **Recovery** takes the anchors from the audit report's `taskCursor`. `session-recover.md` Step 3's read-mode
  mechanics become a fire-point to this method, its frontmatter declares it, and its stop rules — no verified anchor,
  an unlocatable task section — stay in `session-recover.md`, since recovery has no agenda to load a method exactly
  when a rule applies and is the weakest position for adherence. No recovery CLI change.

#### 8.2 `assess-start-readiness`

The `--start` readiness vet and launch, moved from today's focused-recon arm. Its arguments are the target `slug`, its
meta path, and its task-list path when present. It resolves the target's readiness best-effort — a recorded
ready-attestation when the meta carries one, else whether its tasks are finalized, else dependencies only — then layers
two passes over the result:

- **Tier 1 — deterministic, can gate.** Each dependency edge, resolved by slug with `arc status <slug>`, never a
  state-blind `Depends On` read, gates the launch when unmet. Base-drift staleness gates as a second signal wherever the
  target carries a readiness baseline to measure against. A failed Tier-1 signal blocks the green path and says why.
- **Tier 2 — judgment, never gates.** A sanity check of the pick and an offer of a second opinion, rising from a soft
  invitation (Tier 1 green) to a recommendation (Tier 1 drift), never a block. It reads the concurrent-workload note
  the agenda already carries rather than recomputing it.

At the `launch` gate the agent asks "Launch `<slug>`? (spawn-anchored — `arc start`, then start a fresh session in the
new worktree)". On launch it runs `arc start <slug>`, whose commit and push interlocks and `Class` guard fire unchanged;
checks that the seeded mini-handoff landed in the spawned worktree's SESSION-NOTES, surfacing the gap rather than
reporting a clean launch when it did not; and hands off generically — the worktree path, the slug and branch, and "open
a fresh session there with your harness of choice". It never emits a harness-specific launch command, and moves the
running session only under § 4.7's informed opt-in.

#### 8.3 `discover-next-work`

Orient's discovery, moved from today's Step 4. When the arguments carry a seed naming a backlog work unit, the method
pre-focuses it with a confirm-only init offer. Otherwise it follows the arm for its `pmMode` argument:

- **`arc-in-git`** — render the live project view with `arc status --project` and identify the next queued or
  suggested item; check `.arc/backlog/` for the candidate's source artifacts (PRDs, `draft-*` documents, meta); report
  what exists and its readiness; propose next steps, typically `arc start` to initialize the chosen unit or continued
  drafting, and ask before acting.
- **any other mode** — check `.arc/active/` for the candidate's artifacts, report its readiness, and propose
  `create-spec`, asking before acting.

With more than one candidate it fires `assess-parallel-fit`'s multi-candidate selection over the in-flight set and
surfaces the posture as advisory input. Under full protection it initializes the chosen unit through `arc start` before
drafting or spec work; under partial protection it proceeds to `create-spec` directly.

Today these two arms are the only content the render engine processes in the shipped `session-init.template.md`
(`<!-- arc:if pm.mode ... -->`). The method carries both as prose and follows the matching one, so no method needs
install-time rendering and the method follows a `pm.mode` change without a re-render; the arm that does not apply costs
about 0.4 KB per Orient.

### 9. The spine and the skill

#### 9.1 The spine

`session-init.md`, with a budget of ~13 KB (about 120–150 lines), carries:

1. A signature line and purpose; the definitions of agenda, step, spine, and fragment.
2. Today's output discipline.
3. Run the agenda: the verb with the skill's arguments as flags and `--json`, each passed as one argument (§ 4.2). If
   the verb itself fails, surface the failure and stop — the fallback that cannot depend on an agenda.
4. Executing each step type (§ 3–§ 4): the read rule that loads `read-load-set`, the `fragment` step as the fire-point
   for the declared methods, the recompile rule (run the carried argv as given), each argv element passed as one
   argument (§ 4.2), the handoff rule, and marker writing.
5. Orientation, emitted once at the agenda's last step (§ 4.1) and framed by `orientation.shape`. Its `render` steps
   are conditional sections and its `note` steps advisory lines, each emitted verbatim and once, in order. Under
   `work-state` the agent composes Last completed, Current task, Blockers, and Next action from the meta and
   SESSION-NOTES within today's bounds, and, when it bears on the current task, a cohort-coordination line from the
   cohort document it read; under `subject` it frames the summary on `orientation.subject` instead; under `checkout`
   orientation is the header and checkout surfaces, with no thought-state lines and no subject; under `none` it is the
   `render` and `note` steps alone. It reports any `exec` that ran without an offer. The never-include list and the
   restating anti-pattern stay.
6. The SESSION-NOTES authority boundary: it may supply roster and context anchors (`Working On`, `Session Type`,
   `Commit at Handoff`) and human working context, never lifecycle phase, workflow, load set, or live Git facts.
   WORKING-MEMORY entries bind as active constraints until each one's `_Remove when:_` trigger is met.
7. Mismatch handling, today's Step 6 with both axes (truth of work state, where Git is authoritative; which work is
   being picked up, where identity-filtered metas and the worktree list are), auto-recover-with-notice versus
   stop-and-ask; a freshness gap that suggests an interrupted session runs `process-task-loop` § Crash Recovery.
8. Frontmatter: `arc.methods` declares the three methods and keeps today's `session-state` with its override pointer.
   The arms' existing workflows keep their own declarations.

The budget is what holds Goal 1 on every arm. Projected from today's text, at ~13 KB a plain resume lands near 22% of
today's `session-init.md`, Orient near 26%, and `--start` near 27–28%; the text the spine keeps from today projects to
~16 KB, so the rewrite compresses it by about 3 KB, most of it from the orientation rules.

The spine names no probe slot, slot field, or arm condition: it dispatches on step types and on `orientation.shape`, a
closed set of four the compiler assigns per row, so a new surface or an arm that takes an existing shape is a compiler
change. With the `pm.mode` arms in `discover-next-work`, the spine has nothing for the render engine: it ships as a
plain `session-init.md`, and its `init-recipe.json` entry drops the `.template.md` suffix, which marks render-engine
input.

#### 9.2 The `arc-session` skill

The skill shrinks to a hand-off: run the spine, passing the skill's arguments as the verb's flags. Its restatement of
each flag's handling (~2.4 KB), which the workflow also carries, goes; its description line keeps the flag list and
gains `--context`.

### 10. Removals

- **`session-init.contributor.md`**, with its `init-recipe.json` entry and the contributor branch in the workflow. Under
  the storage contract a contributor's work unit becomes an ordinary record in their own store, so the separate
  `.arc/user/<identity>/active/` scan the variant exists to perform goes away. It is deleted now under the
  pre-public-release posture. Until the flip a contributor takes the maintainer path, which already finds their work:
  the in-repo derived reader scans `.arc/user/<identity>/active/` beside `.arc/active/` for every identity, whatever its
  role (`derived-evidence.ts`, `derived-lifecycle-evidence.ts`), so the selected row's `metaPath` and load set carry a
  contributor's meta; the session notes come from the per-work-unit path the load set emits. The one load the variant
  adds survives: the entry prefix reads `AGENT-BRIEF.CONTRIBUTOR` for the `contributor` role, so
  `reference/briefs/README.md` and `user/README.md`, which promise that load, stay true. `AGENT-BRIEF.CONTRIBUTOR` and
  the contribution ceremony stay.
- **`session-init/probe-envelope.md`**, both copies and its recipe entry. Only `session-init.md`'s Step 1 pointer
  references it in shipped content. Its text hand-writes shapes `SessionInitProbeResultSchema` already declares, which
  `arc schema get session-init-envelope` serves. The notes a remaining shipped reader relies on — the `inboxState`
  routable count that `init-work-unit.md` reads — move into `.describe()` on those fields, which the served schema
  carries; the rest go with the file.

### 11. The always-loaded cheap tier

Both copies of each shipped file. Every destination for moved text is checked against `init-recipe.json` in both
directions — a file present in the package, listed in an index, and byte-identical across copies can still ship
nowhere, and a file assumed not to ship can.

- **`DEV-RULES.ARC`:** § When to Load's stale clause ("process-task-loop loads conditionally at session-init when the
  active meta shows active task work", where the workflow is projected from the task cursor), keeping its operative
  "load it before beginning any task"; the duplicate `STRATEGY-INDEX`, workflow-authoring, and methods bullets with
  their link definitions; the preamble's `DEV-RULES.PROJECT` pointer; § Discovered Work Routing's Errand-vs-work-unit
  pointer; § Method loading's "declare what your own body fires" sentence, restated in `strategy-workflow-authoring.md`;
  § Artifact relocatability's narrative, since the CLI performs the move. Wording fixes, not cuts: § Commit control's
  envelope field path for the commit interlock becomes `config.value.settings["commit.interlock"]` read from the
  agenda's residual `config`; `arc.role`, the git config key a person sets, stays.
- **`AGENT-BRIEF.ARC`:** correct the PRD → task generation → execution pipeline line and the release-push "takes no
  target argument" claim (`arg-grammar.ts` accepts a matching `-u origin <branch>` pair); cut the stale one-level
  backlog-nesting line and the footer. The Methods line stays: fresh reviewers read the briefs and not `DEV-RULES.ARC`.
- **`STRATEGY-INDEX`:** the purpose sentence, duplicated in `DEV-RULES.ARC`; the "create project strategies" prose and
  example list, repeated in `strategies/project/README.md`; the "these ship with the framework" line.
- **`QUICK-REFERENCE.template` § Environment & Path Context:** the duplicate `.arc/` row and the fill-time comments.
  The heading stays: `resolveLoadSetManifest` keys the partial read on it.
- **`AGENT-BRIEF.PROJECT.template`:** the fill-time comments, their examples moved to `02_define-project`'s step; the
  footer.
- **`DEV-RULES.PROJECT` (shipped):** the domain-rules paragraph's stale `constitution/` path, corrected to
  `system/rules/` rather than cut, since its load-on-demand trigger is the only always-loaded statement of when to read
  the files `domainRules` lists; duplicate pointers; the capture-routing default text, which duplicates `DEV-RULES.ARC`
  and contradicts it in its first bullet, down to its heading and a placeholder line, since
  `03_configure-external-integration` targets that section; the quality-gates definition sentence; fill-time comments;
  the self-description.
- **`arc-session` skill:** § 9.2.

### 12. Propagation

Shipped readers that assume the session holds the probe envelope, describe the bulk load, or depend on a removed arm,
retargeted in both copies:

- `DEV-RULES.ARC` § Commit control — the prefix mapping and `releaseRouting` lookups name "the session-init envelope";
  they read the agenda's residual inputs at the same field paths, or the envelope.
- `strategy-session-operations.md` — § Probe pattern and § Extension contract (the agenda verb is a second reader
  beside the probe, not a slot resolver; a new slot reaches the session through a compiler case), § Loading Mechanisms
  § Session initialization (agenda-driven, not a prescribed bulk load), § Method Classification by Trigger (the three
  methods), and § Session-Init Consumption's "Methods — no init read" (the spine fires three methods at `fragment`
  steps).
- `system/methods/README.md`'s loading model — "Session-init does not read methods" becomes false for the same reason.
- `assess-parallel-fit.md` — its consuming workflows name `session-init.md`; the fire-point moves to
  `discover-next-work`, and `in-flight-scope-check.md` keeps its own.
- `strategy-configurability-architecture.md` — the agent learns the active configuration from the agenda's residual
  `config` rather than the session-init probe.
- `template-dev-rules.md` — malformed domain-rules frontmatter surfaces in `domainRules.warnings` at session-init; it
  now arrives as a `note`.
- `draft-design.md`'s grooming-entry skip says session-init's signal-leaf relocate moves a `--plan` session onto
  `chore/groom-<slug>`; no command creates that branch. The skip now applies only when the checkout is already on a
  grooming branch, so `arc plan check` runs on every other `--plan` entry and a grooming draft is never written on a
  protected base.
- `init-work-unit.md`'s inbox backstop reads `inboxState` "from the current session-init probe if available, otherwise a
  fresh read-only probe"; it reads the agenda's residual `inboxState` instead, keeping the fresh probe as the fallback.
- `session-handoff.template.md`'s Next Task field says the triple-anchor format "enables graduated lookup at session
  init"; init anchors on the task cursor (§ 8.1), so that clause goes and the field stays a pointer for the reader.
- `run-errand.md`'s Resume mode runs `arc errand materialize` for a remote-only generation and continues from the path
  it returns; session-init's materialize offer hands that off (§ 5.8), so Resume mode consumes only the checkout
  session-init selected. Its Launch mode renders `arc errand open`'s `recommendedPromptText`, which names the opened
  checkout, since session-init no longer runs the open (§ 5.4).
- `arc-config.yml` (both copies) — four comments on the `session.init_pull` and `session.init_load` keys point at
  `session-init.md § Conditional Sync Pulls`, a section the spine no longer has, and two describe behavior this change
  alters (the post-pull re-probe, now a recompile after every sync; the dirty-tree refusal under `always`, § 7.1). Each
  comment describes its policy's behavior in place, and the base policy's `always` line drops "(refused on a dirty
  tree)", already false: the checkout's dirt does not gate the base channel (`commands/status/run.ts`).
- `AGENT-BRIEF.CONTRIBUTOR.md` (both copies) — it tells contributor sessions to follow session-init "with the
  contributor path", describes a flat SESSION-NOTES, and says maintainer sessions load the full document set instead.
  Contributors now take the ordinary path with this brief added to the universal reads (§ 5.1), their session notes at
  the per-work-unit path, so those lines say that.
- `reference/briefs/README.md` (both copies) — its loading model points at "session-init.md Step 3", a step the spine
  does not have; it points at the spine.
- `session-recover.md` Step 3 — § 8.1.

The recipe changes (§ 8, § 9.1, § 10) also reach two repository records, updated with them:

- `strategy-package-project-sync.md` (project-only) — the Framework, Configurable, and installed-file counts
  (`framework-sync.test.ts` pins the last two to the recipe) and the Configurable list; and the `arc:if` template table,
  the template-counterpart list, and its count, which drop `session-init.template.md`.
- `.arc/system/.internal/manifest.json`, the self-hosting manifest, whose membership and classification the same test
  pins to the recipe.

### 13. Boundary and order

- **Depth `high`, Class `Heavy`.** Derivation fires: a real design was authored — the verb, the step vocabulary, the
  recompile and answer model, the per-row compilation. Scale fires: two copies of a ~1,080-line workflow, a 55 KB
  envelope reference, a new CLI module beside an oversized composer, four wording-pinned integration tests, and the
  recovery read path. The design composes rather than invents: the step vocabulary, `loadSet`, precomposed
  `recommended*` text, `SessionAction`, and the arm-result verbs — `arc errand next`, `arc plan check`,
  `arc housekeep check` — exist.
- **Stays one work unit.** One concern — what a starting session reads and how it orients — designed as a whole. The
  forecast change set is roughly 7–8k changed lines (Markdown ~3.8k, about half of it deletion across both copies; CLI
  ~1.7k; tests ~2–2.5k), below the project's ~10,000-line mark, and this specification is below its ~1,500-line mark;
  the task list's phase count is the mark left to check, at task generation. The cheap tier (§ 11) is the one separable
  seam: it is independently landable and in a different layer, but small (about 10 KB of edits) and part of the
  done-signal's second part, so it stays a review chunk of this change rather than its own unit or deliverable.
  Re-checked at task generation against the task list's size.
- **Lands before the flip.** § 7 isolates what the cutover deletes.
- **Order with the worktree-lock change.** § 14.1.

### 14. Expected contracts

#### 14.1 Locked worktree registrations

An unshipped change locks every checkout ARC spawns for a work unit or an Errand, so a plain `git worktree remove`
refuses. It passes each registration's lock reason into the missing-folder composers (`missingRegistrationActions`,
`readStoreMissingFolderActions`, and branch-gone recovery's candidate builder): a missing-folder registration under its
lock keeps a typed `arc teardown <name>` where the sweep offers one, since teardown removes that lock itself, and every
other locked missing-folder registration takes `git worktree unlock` first. The compiled cleanup lists show each
report's own remedy (`teardown`, `actions`, or a `missingFolders` remedy) under § 4.11 and compose no removal command of
their own, so the lock change alters the text they carry and not this design. Whichever of the two changes lands second
carries the other's wording in the shipped prose.

#### 14.2 The store path

The store-path arms the compiler reads — `findStoreMaterializableWorkUnits`, the store user slot (§ 2.4), the store
missing-folder actions — exist and run over the reference backend in tests; the flip makes them the live path. The
compiler compiles both arms from whichever the probe's readers return.

## Alternatives & Rationale

- **An agenda slot in the existing envelope.** Rejected for the dedicated verb: the agent would still ingest the whole
  envelope, which is larger than any single always-loaded document in a busy repository, and signal flags on a `status`
  verb are semantic drift.
- **Purpose-built slots, no step vocabulary** — an entry-fragment slot plus an ordered surfaces array. Less machinery,
  but the sync offers, the materialize and cold-start mutations, and the final gate would each reinvent a shape the step
  list gives once. It is the minimal credible alternative the step vocabulary is measured against.
- **Split the file without CLI selection.** Cuts the read but keeps the agent doing dispatch the CLI can compute, which
  is where agents trip.
- **Compress the monolith in place.** Bounded yield, and each new surface still adds always-read prose.
- **Fragments as plain files with a CLI id → path map, or under a new frontmatter key.** A bespoke loading path, or a
  declaration key with no wider contract behind it. A workflow path the CLI supplies is not such a map: it names an
  existing workflow by its shipped path, as recovery derives it, and adds no fragment namespace.
- **A fourth method for branch-gone recovery.** Unsupported machinery: every branch-gone outcome compiles (§ 5.3),
  leaving no judgment for a method to hold.
- **Compose only the simple surfaces, leaving the cleanup lists to a method.** Sessions with residue would still read
  ~6 KB of field-dispatch prose.
- **Agent-side answer memory.** The agent records each answer and re-applies it after every recompile, matching
  recorded keys against each offer's choices, and tracks followed fragments and completed `exec` steps. Rejected for
  CLI-carried answers: it is deterministic dispatch the compiler can do from argv it already builds, its narration
  costs spine bytes, and an `exec` the agent fails to track can loop.
- **An optional register field on `note`.** Rejected: this change classifies no advisory (Non-Goals), and a field
  nothing fills is speculative; the work that classifies advisories adds it with its first value.
- **The verb runs the sync itself.** Rejected: an offered pull is a person's decision, and a verb that both pulls and
  compiles is no longer non-destructive; recompiling after each sync reuses today's "re-run the probe" rule.
- **Compile the `--start` vet from `arc start`'s preflight now.** It needs a shared start core that does not exist yet;
  until then the vet can report ready where `arc start` refuses.
- **A full agenda for `session-recover`.** A small extra saving, off the first-line budget, touching the recovery
  handler, the seed schema, the PreCompact hook path, and adherence-sensitive text.
- **Keep a strawman fresh start under ~10k tokens and widen into rule placement.** The always-loaded text that stays is
  ~10.5k on its own and is constraint and vocabulary text; cutting it is placement design, often test-pinned or
  deliberately placed.
- **Demote `STRATEGY-INDEX` or `QUICK-REFERENCE` § Environment & Path Context from the load set.** Their demotions are
  mutually exclusive with `AGENT-BRIEF.PROJECT`'s, fresh reviewers read the briefs, ~200 tokens remain at stake after
  the cheap tier, and `STRATEGY-INDEX`'s value as an awareness surface is unmeasured.
- **Install-time `arc:if` for `discover-next-work`'s `pm.mode` arms.** Would make one method a render-engine template,
  the only one, and miss a `pm.mode` change until re-render, to save ~0.4 KB per Orient.
- **Keep `--plan`'s grooming-entry skip as written.** It relies on a relocation no command performs, so a `--plan` entry
  could skip `arc plan check` and draft on a protected base.

## Cross-cutting Considerations

- **Compatibility.** The probe envelope does not change shape: `SessionInitEnvelopeObjectSchema` is strict and
  `assertSessionInitProbeResult` checks it before emission, and the agenda is a separate registered schema. `loadSet`
  stays additive at v1 (`auditLoadSetManifest` treats a version mismatch as drift): no position marker in `ReadMode`,
  `group` and `cursor` on the agenda step rather than on `LoadSetEntry`, and paths from the layout resolver. File
  removals and the methods' interim public shape follow the pre-public-release posture: no aliases or migration readers.
  Making the methods non-overridable later retracts an override surface — a change in place before ARC's first public
  release, a compatibility change after it.
- **Size gate.** `handleSessionInitStatus` and `runSessionInitStatus` already run under suppressions and
  `src/handlers/status.ts` is near the 1,000-line file gate, so the compiler is its own module, split by concern (verb
  and precedence, steps and schema, sync compilation, surfaces, the cutover module) to stay inside the per-file and
  per-function limits.
- **Trust.** The agent runs only argv the agenda carries, each the CLI's published argv unchanged or one the compiler
  composed from slot fields and Git facts (§ 4.11). No withheld remedy becomes automatic; no forbidden flag is added.
- **Performance.** Each recompile costs one compile, where today a clean pull skips the re-probe; a combined accept
  runs two syncs under one compile. The agenda omits the roster's per-checkout load sets, so its output is a fraction of
  the envelope's in a busy repository.
- **Testing.** Unit tests cover the compiler per row and per slot outcome — each § 5 row, each § 5.3 kind, each § 6
  surface's mapping, the refusals, and the failed-slot degrade — over fixture probe values. The production schema id pin
  gains `session-init-agenda`. Four integration tests read session-init, `probe-envelope.md`, and skill wording:
  `locus-methodology-contracts.test.ts`, `session-init-delivery-position-workflow.test.ts`,
  `session-init-reconcile-workflow.test.ts`, and `review-gate-workflows.test.ts` (the last pins the Session Type
  override's limits and names the `.template.md` path). A pin whose rule the spine keeps re-pins to the spine's wording;
  a pin whose rule moves into the compiler — the frame authority, a surface's condition, the Errand materialize command,
  the `--errand --next` phrases the skill restated — becomes a compiler unit test of that behavior; a pin of
  `probe-envelope.md` text that moves into `.describe()` reads the served schema; the Errand materialization checks the
  handoff replaces become a test of the handoff. `framework-sync.test.ts`'s recipe-membership, rendered-source,
  inventory-count, and manifest checks and `skills.test.ts`'s generated-copy check cover the recipe and skill changes.
  No eval instrument for workflow prose exists, so verification also leans on rehearsal sessions over fixed fixtures on
  a kit install (Success Criterion 3) — a plain resume, `--plan`, `--errand`, branch-gone, Orient discovery, `--context`
  — a proxy, named as one.
- **Procedure and knowledge strategies.** The design keeps to `strategy-procedure-evolution` and
  `strategy-knowledge-evolution`: the agenda is a flat list whose mutations recompile rather than nest; the spine
  narrates no Git mechanics, which reach the agent only as argv; the four new terms are defined in the spine, their
  only consumer, rather than in `AGENT-BRIEF.ARC`; and arm constraints sit where § 8 places them.
- **Rollout.** The spine, the verb, and the methods land together; the probe stays for its other readers. Nothing is
  configured per project.
- **User-facing impact.** A session's orientation carries the same surfaces, in the same order and with the same
  questions, read sooner and with less context spent; materializing work into another checkout now hands off to a fresh
  session there instead of continuing in place.

## Success Criteria

1. **Part 1.** Measured both ways (below), the spine plus `read-load-set` plus the entered arm's method, if any, is at
   most ~28% of the baseline `session-init.md` on a plain resume, Orient, and `--start`.
2. **Part 2.** On a kit install, a session entering the Orient row, the load before the first user-facing line, less
   an empty session's on the same harness, is at most ~60% of the same quantity measured before the build.
3. **Measurement.** A **kit install** is ARC installed from a packed package tarball into a project with no ARC source,
   then `arc init`, then the install committed with hooks on and pushed, as a new project gets it. That leaves the
   primary clean on its base with no work unit, so a session there derives `free-primary` and enters Orient; an
   uncommitted install would derive `unresolved-checkout` and stop. Baseline and result use the same two instruments:
   itemized headless Claude Code runs (`claude -p --output-format json`), each reading one item, their reported
   input-token usage compared against an empty run; and one real session on a kit install read through the harness's
   context report before the first line, less the same report for an empty session. The baseline is recorded before the
   build starts.
4. **The verb.** `arc agenda session-init --json` prints an agenda that validates against
   `arc schema get session-init-agenda`; it refuses each invalid flag combination with a typed error; and, before the
   flip, a run leaves the checkout's files, refs, notes, and markers as it found them apart from `FETCH_HEAD`, with both
   temporary refs deleted (§ 2.4).
5. **Rows.** For each row in § 5.4 and each branch-gone kind in § 5.3, the compiler emits the specified step sequence
   and `orientation` over a fixture probe value, including the held path, the decline paths of bare `--errand` (with
   and without `--isolate`) and `--plan`, and an unresolved `--start`.
6. **Surfaces.** Each surface in § 6 compiles to its mapped step with CLI-composed text, and a failed slot yields its
   degraded-slot `render` and no action.
7. **Withheld actions.** No surface whose rule withholds automatic execution compiles to an `exec`, no withheld or
   owner-held remedy compiles to an action, and every action's argv is published or compiler-composed as § 4.11 states.
8. **Sync ordering and answers.** Every sync `exec` and sync choice recompiles; every `exec` is its agenda's last step;
   the combined offer replaces two offers; the user-reference apply follows the sync steps. Every emitted recompile argv
   carries the signals, answers, and done ids its position implies (§ 3.1, § 4.6); given them, the compiler omits each
   answered offer, done or answered `exec`, and followed method fragment, compiles an answered branch-gone question to
   the held path and an answered cold-start question to Orient, emits the `answered` note, and turns a sync the session
   ran or accepted that its slot still recommends, a failed one continued past included, into the `sync-unsettled` note.
9. **The spine.** `session-init.md` is within ~13 KB, names no probe slot, slot field, or arm condition, and ships
   without the `.template.md` suffix.
10. **Methods.** `read-load-set`, `assess-start-readiness`, and `discover-next-work` are declared in the spine, carried
    in `init-recipe.json` and `CONFIGURABLE_FILES`, and present on a fresh `arc init`; `assess-parallel-fit.md` and
    `in-flight-scope-check.md` ship too. `session-recover.md` fires `read-load-set` and keeps its stop rules.
11. **Removals.** `session-init.contributor.md` and `probe-envelope.md` are gone from both copies and the recipe, no
    shipped file references them, and the `inboxState` routable-count note appears in the served envelope schema.
12. **Cheap tier.** Each § 11 change lands in both copies, and every destination of moved text has an install
    disposition.
13. **Propagation.** Each § 12 reader is retargeted, and the four wording-pin test files pass against the new text.
14. **Rehearsal.** Each rehearsal fixture — plain resume, `--plan`, `--errand`, branch-gone, Orient discovery,
    `--context` — starts from a kit install, sets up the state its row needs, and reaches the same orientation surfaces,
    questions, and actions as today's workflow on the same fixture, except where this specification states a change.

## Open Questions

None blocks starting. The per-group read budget's value, the surface ids' spelling, and the compiler's module split are
implementation detail.

## Amendments

[none]
