# Draft: Naming Conventions

**Purpose:** Formalize the `TYPE.QUALIFIER` naming convention for ARC's paired / multi-instance doc
surfaces, codify the scope-ladder qualifier, and apply it via a set of file + section renames (inbox
collapse, `STATUS` / `MEMORY` / `NOTES` families). The work is naming + cascade; no behavioral change.

- **State:** Provisional — captured from Worktree Foundation planning (2026-05-24). Convention and renames
  settled in discussion; cascade scope, sequencing, and migration not yet planned.

- **Created:** 2026-05-24

- **Origin:** Surfaced while naming WF's new user-scoped in-flight view. Choosing that name exposed an
  emergent, half-applied convention across ARC's doc surfaces (`DEV-RULES.*`, `AGENT-BRIEF.*` already
  conform; the inboxes, the readiness view, and the personal-context files do not). Capturing the whole
  convention rather than naming one new file in isolation.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Decide and cascade `override-mode: extend` → `augment`**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: naming-conventions`), housekeep drain (2026-07-19);
  captured during `review-architecture` draft reconciliation.
- _Concern:_ additive method composition already ships as `override-mode: extend`, but `extend` collides with
  ARC's separate Extensions mechanism.
- _Approach:_ decide the final term and run the behavior-preserving rename through the frontmatter parser and
  types, tests, method guidance, `testing-standards`, and strategies. Keep replace-vs-additive semantics and
  activation owned by `customization-arch-realign`; `composable-workflows` consumes the final enum without
  reopening the vocabulary or semantics.

### `[ ]` **Conform the enforced conventional-commit policy to its named standard**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-14); captured during
  `commit-message-submission` design review.
- _Concern:_ ARC's enforced `conventional` grammar makes scope mandatory, rejects the standard `!` breaking-change
  marker, and omits common `build` / `ci` / `style` types. Projects using commitlint, semantic-release, or
  conventional-changelog therefore face policy conflicts, and ARC cannot emit a standard semver signal.
- _Approach:_ decide each divergence deliberately—accept `!`, settle optional versus intentionally strict scope,
  extend or configure the type set, and consider a scope vocabulary axis. This WU owns commit-message policy and
  the commit-msg convention surface; `commit-message-submission` owns the canonical parser/transport mechanism,
  so policy decisions become fixture and configuration deltas rather than a parser rewrite.

### `[ ]` **Run a vocabulary-budget pass over adopter-facing coined terms**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-13); release-gates portfolio review.
- _Concern:_ consistency rules do not bound coined-term quantity. Evaluate a small justified adopter-core glossary,
  rename-to-standard as the default disposition, and a possible glossary-membership check in `knowledge-lint`.
  Keep internal authoring vocabulary separate from the adopter-facing budget and coordinate placement with
  `knowledge-architecture`.

### `[ ]` **Include `arc start` ceremony commits in the init/activate footer split**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: naming-conventions`), housekeep drain (2026-07-07);
  captured during `finalize-parallelism` Task 2.4.a (`arc start` substrate), 2026-07-04.
- _Concern:_ This WU already carries the `(activation)` init/activate split: `init-work-unit` creates a
  Planning-state WU, while `activate-work-unit` advances Planning → Active. FP Task 2.4.a adds a formulaic shell
  `arc start` ceremony commit path that currently stamps `Context: meta-<slug>.md (activation)` for the init/start
  ceremony, so the split is no longer only workflow prose and hook documentation; it is becoming encoded in CLI
  helper output and its tests.
- _Approach:_ when reconciling the footer meta-category set, update the `arc start` ceremony message builders /
  tests in parity with the chosen decision: distinct init context, renamed `activation`, or clarified activation
  scope. Treat create-new start and graduation/start paths together so the CLI, method docs, commit-msg hook,
  workflow guidance, and tests stay aligned.

### `[ ]` **Name extensions by fire-point, not intended action**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: naming-conventions`), housekeep drain (2026-07-03);
  captured during `adversarial-review` planning.
- _Concern:_ extensions are hook points whose `.actions` payload is project-configured, so names should describe
  the fire point rather than an intended action. `pre-spec-finalization-review` and the broader `*-review`
  family bake "review" into the seam; point-named extensions such as `post-context-load` and `pre-activation`
  are the better precedent.
- _Fold-in:_ codify "extensions are named by hook point" as a naming standard before any rename cascade. Treat
  renames as breaking migrations because names appear in workflow fire-point markers, point-scanner validation,
  and project-configured extension files.

### `[ ]` **Codify the semantic-hygiene verb standard**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: naming-conventions`), housekeep drain (2026-07-03);
  captured during `adversarial-review` task generation.
- _Concern:_ `adversarial-review` forced a latent verb taxonomy open: `audit` = grounded validation against an
  external referent; `review` = internal artifact/diff quality; `assess` = readiness or fit; `verify` = confirm
  against an expected result; `check` = cheap precondition guard.
- _Fold-in:_ codify the standard here. Renames that fail it should route as judged follow-through, not a mass
  sweep in the originating WU.

### `[ ]` **Broaden scope to prose/vocabulary conventions (general naming-conventions WU)**

- _Routed from:_ decided at the work-routing-discipline housekeep drain (2026-06-01).
- _Concern:_ this WU's current scope is file/section _renames_ (the `TYPE.QUALIFIER` cascade). The two
  vocabulary captures below — prose word-choice conventions, not file names — broaden it into a general
  **naming-conventions** WU. The stub-identity rename `doc-naming-convention` → `naming-conventions` (dir +
  `meta-*`/`draft-*` filenames) was pulled forward at the retirement pass, to avoid colliding with the
  `doc-conventions` cohort name. What remains for this WU's first iteration: absorb these captures into the body,
  then run the full reference cascade — the `TYPE.QUALIFIER` file/section renames plus reconciling residual
  `doc-naming-convention` mentions across work-routing-discipline's spec/notes/tasks and other backlog drafts.

### `[ ]` **Spell out "work unit" on user-facing surfaces**

- _Routed from:_ `USER-INBOX § Atomic`, work-routing-discipline housekeep drain (2026-06-01).
- _Concern:_ add a DEV-RULES.PROJECT § Documentation Standards rule — write "work unit" in full on user- /
  adopter-facing surfaces; reserve `WU` for internal-dev shorthand and dense internal notes. Cheaper than
  renaming the class; resolves the `WU`-on-user-surfaces aesthetic. (Touches a rules doc — quick-tier.)

### `[ ]` **Evaluate a `housekeep` → `housekeeping` prose-form sweep**

- _Routed from:_ `USER-INBOX § Atomic`, work-routing-discipline housekeep drain (2026-06-01).
- _Concern:_ `arc-housekeep` is the command/skill name (imperative, like `arc-commit`), but as a bare prose
  modifier the doctrine uniformly uses "housekeep drain / flow" (DEV-RULES.ARC § Discovered Work Routing + the
  strategies, ~8 usages). "Housekeeping" reads more naturally as an English adjective; the question is whether to
  standardize the prose form to "housekeeping" (keeping the command `arc-housekeep`) in a deliberate cross-surface
  sweep, or leave the established compound. Held during work-routing-discipline (Auto-Merge Lane work — decided to
  keep "housekeep drain" for consistency then). Low priority; a vocabulary/doc-convention sweep, dual-copy.

### `[ ]` **Italic conventions: narrative-preamble blockquotes + underscore-over-asterisk emphasis**

- _Routed from:_ `BACKLOG-INBOX`, work-routing-discipline retirement pass (2026-06-01).
- _Concern:_ two italic-style conventions that fit the broadened naming-conventions scope. (1)
  **Narrative-preamble blockquotes** — italicize only the file-top narrative preamble (first blockquote before any
  `##`, plain prose, no list items / GFM directive / bold-field markers); the other three blockquote shapes (GFM
  callouts, structured field blocks, requirement notes) stay non-italic. Doubles the "meta-commentary, not
  content" signal in raw markdown. (2) **Underscore over asterisk emphasis** — standardize ARC on `_text_` over
  `*text*` repo-wide and enforce it; both render identically so mixed source is noise, and underscore is already
  ARC's dominant convention. Enforcement candidate: a heal-on-touch pre-commit hook rewriting `*…*` emphasis runs
  → `_…_` on staged files (single-asterisk emphasis only — never `**bold**`, list markers, or code/glob
  asterisks), so migration is incremental rather than one risky repo-wide sweep. Codification home:
  DEV-RULES.PROJECT § Documentation Standards § Markdown quality (explicit paragraph preferred over by-example).
  Quick-tier per the atomic-tier infra-edit smell flag (multi-file sweep touching `.arc/system/` +
  `.arc/reference/`).

### `[ ]` **Commit-message discipline (self-hosting): `(arc)` scope overuse + `docs` type misuse — adherence gap**

- _Routed from:_ follow-up housekeep drain (2026-06-01), dogfooded across this session's own PRs.
- _Concern:_ `commit-format` § Type selection + § Subject scope already codify both rules clearly — `docs` is
  "external-facing prose only (`README.md`, docs-site, onboarding)"; `(arc)` is reserved for cross-cutting
  concerns, "not a default-when-uncertain catch-all" — yet both are widely under-adhered in the self-hosting
  repo (five PRs in one session all used `docs`/`chore(arc)` for bounded methodology-artifact edits that should
  have been `fix(brief)` / `fix(hook)` / `fix(strategy)` / `chore(backlog)`). The rules are excellent; the gap
  is **adherence, not authoring.**
- _Shape:_ enforcement + salience, not new guidance. (1) A `commit-msg` hook check — `docs` misuse is
  mechanically catchable (flag `type: docs` when no staged path is under an external-facing surface like
  `README.md` / docs-site); `(arc)` scope can warn-to-confirm (a hook can't fully judge "cross-cutting"). (2)
  Reinforcement/salience via `arc-reinforce`. Cross-ref `commit-format` § Type selection + § Subject scope.

### `[ ]` **Clarify `arc sync` directionality in naming/expectation terms (publish-only vs. bidirectional)**

- _Routed from:_ `USER-INBOX § Backlog`, housekeep drain (2026-06-02); captured during in-flight-awareness spec
  planning. (Split capture — the capability angle routed to `cross-machine-sync-coherence`.)
- _Concern:_ `arc sync` is a smart _publish_ orchestrator, not bidirectional — the worktree leg is push-only
  (detects-and-blocks on `remote-ahead` / `diverged` rather than pulling), so it can't replace `git pull` on
  machine arrival. The name oversells it as bidirectional.
- _Proposed (naming/expectation angle):_ if it stays publish-only, rename or document the directionality so the
  name doesn't imply bidirectional reconcile.
- _Scope:_ S — naming/doc decision (the capability question is the sibling note in `cross-machine-sync-coherence`).

### `[ ]` **H1 styling for the inbox / working-memory / notes file family**

- _Routed from:_ `ATOMIC-INBOX`, shared-inbox sweep (2026-06-02). Informs the Renames table — decide the H1
  _form_ the renamed surfaces adopt.
- _Concern:_ the user-scoped capture surfaces (`SESSION-NOTES`, `WORKING-MEMORY`, `USER-INBOX`, `ATOMIC-INBOX`)
  use Title-Case H1s (`# Session Notes`, etc.). Alternative: filename-style ALL-CAPS-HYPHENATED H1s
  (`# INBOX.USER`), which add visual weight and make file identity instant in raw-markdown views (the primary
  consumption mode), at the cost of diverging from standard H1 convention and reading shouty when rendered.
  Half-measure: space-separated all-caps (`# WORKING MEMORY`).
- _Why here:_ the rename cascade rewrites these H1s anyway (`SESSION-NOTES → NOTES.SESSION`, etc.), so the
  styling choice is a natural rider on that work — neighbors the _italic conventions_ buffer entry above (same
  file-family styling axis).
- _Scope:_ small ripple — the renamed templates + instances + any cross-doc references quoting H1s. Defer to
  the cascade.

### `[ ]` **Rename `reference/briefs/` → `reference/agent-briefs/` (disambiguate from the `brief` spec form)**

- _Routed from:_ `USER-INBOX § Backlog` (`WU_Target: naming-conventions`), agile-wu-lifecycle cohort housekeep
  drain (2026-06-04). Captured during `agile-wu-lifecycle` planning (2026-06-04) — the `sketch` → `brief` naming
  decision.
- _Concern:_ AWL adopts `brief` as the floor spec-form name (replacing `sketch`). The existing
  `reference/briefs/` dir (holding `AGENT-BRIEF.{ARC,PROJECT,CONTRIBUTOR}.md`) now shares a stem with the spec
  form. The dir name is also independently imprecise — "briefs" implies human-facing summaries, but these are
  agent-orientation docs (filenames already say `AGENT-BRIEF`).
- _Proposed:_ rename the dir to `agent-briefs/` (matching the `AGENT-BRIEF` filename prefix) and cascade the
  references — ~39 files reference `reference/briefs`, ~109 touch `briefs/` or `AGENT-BRIEF`; includes the
  `packages/arc-framework/arc/**` package-source mirror, which must stay in sync. Decoupled from AWL's naming
  decision (adopting `brief` does not require the rename — filenames don't collide and prose disambiguates by
  context); a standalone doc-naming-convention cleanup. Could alternatively fold into `doc-cascade-sweep`'s doc
  cascade.

### `[ ]` **Adopt "specification" full-word in titles/prose; keep "spec" as identifier + short form**

- _Routed from:_ `USER-INBOX § Backlog` (`WU_Target: doc-naming-convention` → corrected to this stub at drain),
  housekeep drain (2026-06-08); captured at `scalable-authoring-pipeline` Phase 4.
- _Concern:_ "spec" is an unambiguous standard abbreviation, but forcing the short form into every H1 title /
  prose position reads awkward (e.g. `# Workflow: Create Spec`). Spelling out "specification" where it reads more
  naturally — keeping `spec` as filename/identifier and short form — may feel more polished.
- _Proposed:_ Do **not** use a soft "where it feels natural" rule — it drifts and yields a worse half-and-half
  state than uniform "spec," especially beside the fixed identifiers (`spec-*`, `create-spec`, `spec-review`).
  If pursued, do it as a crisp, complete, ruled pass — e.g. spell out "Specification" only in H1
  workflow/template titles + the first defining sentence per doc; "spec" everywhere else and always as
  identifier/filename. Lean: marginal / optional — but if done, ruled and complete.
- _Scope:_ ARC-wide naming convention — templates, `create-spec`, `spec-review`, docs-site, all three authoring
  workflow H1s. Pairs with the `ROADMAP → STATUS.PROJECT` rename this WU's family owns. Explicitly **not** the
  SAP 5.R workflow-coherence pass (too narrow for an ARC-wide convention).

### `[ ]` **Reconcile the commit-footer meta-category set across method, hook, and test**

- _Routed from:_ `USER-INBOX § Atomic` (reclassified larger-than-atomic at drain), housekeep drain (2026-06-11);
  captured decomposing `concurrent-work-conventions` (the `decompose-work-unit` ceremony commit).
- _Concern:_ the allowed `(category)` tokens for `Context: meta-*.md (...)` footers are out of sync across their
  three homes. `decompose-work-unit.md` prescribes `(decomposition)`, but that token is in neither the
  `commit-footer.md` method's enumerated meta categories nor the commit-msg hook regex — verified live: the hook
  set is `(handoff|activation|integration|archival|deactivation|maintenance|incidental during …)`, so every
  decomposition ceremony commit fails validation (worked around with `(maintenance)`). The method also lists
  `(graduation)` (provisional→planned promotion), which the hook omits too.
- _Approach:_ add `decomposition` and reconcile `graduation` into the allowed set in **all three homes** — the
  `commit-footer.md` method doc, the commit-msg hook regex + its example/error text, and
  `commit-msg-footer.test.ts` — across **both** the package source and the `.arc/` instance copies. Design fork: is
  `decomposition` its own category (lean: yes — `decompose-work-unit` frames it as a genuine lifecycle transition)
  or does it fold into an existing token?
- _Overlap:_ subsumes the narrower "Add `(graduation)` as a commit-footer context category" capture drained
  2026-06-11 — reconcile both tokens in one pass; don't double-build.
- _Home note:_ routed here as the commit-msg-hook / convention owner (pairs with this WU's commit-msg scope/type
  adherence hook); `quality-gate-hooks` is the alternative generic-hook home if the method/test split lands better
  there.

### `[ ]` **Coordinate the frontmatter-`type` / prefix-scheme question with `idiomatic-alignment`**

- _Routed from:_ OKF / LLM-wiki idiomatic-alignment exploration (2026-06-13).
- _Concern:_ the new `idiomatic-alignment` WU evaluates adding a uniform, orthogonal frontmatter `type` (OKF's
  path-is-ID / type-is-frontmatter split) to resolve ARC's filename-prefix _double-duty_ (the prefix carries a
  type hint _and_ rides the shared slug) and the prefix-less workflows / methods / extensions gap. That overlaps
  this WU's naming-convention surface and the `strategy-file-classification.md` codification it owns, but its
  driver (align with external knowledge-format norms for legitimacy / interop / projection) is distinct from this
  WU's (internal consistency of the hub families).
- _Proposed:_ let `idiomatic-alignment` own and **pull** the frontmatter-`type` / prefix-scheme question for
  cleaner boundaries; this WU keeps the `TYPE.QUALIFIER` hub renames + the file-classification codification.
  Decide the exact split at this WU's next planning iteration (it may stay here if it lands cleaner).

### `[ ]` **Rename the `test-first` method → question-named `test-sequencing` (+ reference cascade)**

- _Routed from:_ `testing-guidance-apparatus` draft-design (2026-06-22).
- _Concern:_ `test-first` names the method after one _answer_ (tests-first), but its contract is to _decide_ test
  sequencing per task — so it reads incoherently when it selects test-after, the exact friction a configurable,
  override-aware testing apparatus exposes. The name-by-question principle wants `test-sequencing` (or
  `test-timing`). Deferred out of `testing-guidance-apparatus` to keep that WU Light, and because the rename is
  cleanest _after_ it ships.
- _Scope:_ rename the method file (both copies) + frontmatter `name:`; cascade every method reference — the
  `generate-tasks` frontmatter declaration, reference-link definitions (`[arc-methods-tf]`), and prose mentions
  across DEV-RULES.ARC, `strategy-task-list-formatting`, `strategy-testing-methodology`, the methods README, and
  templates.
- _Critical constraint:_ `testing-guidance-apparatus` deliberately splits `test-first` into two senses — the
  **method name** (renames here) and the **task-list marker's approach keyword** (`test-first`, stays). Rename
  **method-name occurrences only**; do **not** rewrite the approach-keyword markers. A blind `test-first` →
  `test-sequencing` find-replace would corrupt the markers.
- _Sequencing:_ after `testing-guidance-apparatus` ships. Coordinate with `composable-workflows` if it lands the
  machine-resolvable method resolution by then.

### `[ ]` **Lifecycle-ceremony footer markers + `(activation)` init/activate split**

- _Routed from:_ USER-INBOX housekeep drain (2026-06-24); captured at `lifecycle-closeout` Task 2.2 (2026-06-23).
  Enriches the existing "Reconcile the commit-footer meta-category set across method, hook, and test" concern
  (this WU owns the commit-msg hook + conventions; already subsumes the `(graduation)` capture). Two threads:
- _Marker legibility (promote / park / resume):_ the footer parenthetical must read without ARC knowledge
  (DEV-RULES.ARC § Commit and PR surface language). activation / integration / archival / promotion / demotion are
  legible action-nouns; `(park)` / `(resume)` don't nominalize (`parking` / `resumption` read wrong) and the verbs
  may yet rename (park → pause — owner unresolved; the cohort doc / closeout spec mis-attribute it to
  `idiomatic-alignment`, which excludes internal-vocab renaming). So a uniform own-marker-per-ceremony isn't right:
  `(promotion)` stands alone, but park / resume likely fold to `(maintenance)`. Pairs with the existing
  `decomposition`-category fork.
- _`(activation)` init/activate split (carried from rules-restructure's buffer):_ `init-work-unit` creates at
  State Planning yet shares the single `(activation)` footer with the Planning→Active `activate` transition — same
  meta-category-reconciliation domain; carries a fork (add a distinct init context, rename `activation`, or
  clarify its scope — touches `commit-footer.md` both copies, the commit-msg validator's allowed-contexts list,
  and `init-work-unit.md` commit guidance).
- _lifecycle-closeout's stance:_ it did the bounded **consistency fix** only — folded promote / park / resume
  ceremony footers to `(maintenance)` (legible, already hook-accepted) and dropped the orphaned `(graduation)`
  bullet from `commit-footer.md`. This WU owns the **enhancement**: whether promote earns `(promotion)`, the
  `decomposition` / `(activation)` forks, and the method + hook + test sync.

### `[ ]` **Evaluate the meta `Owner` field → `DRI` rename**

- _Routed from:_ `single-owner-wu-model` create-spec, via USER-INBOX drain (2026-06-24).
- _Concern:_ "DRI" (Directly Responsible Individual) is the precise industry term for the single-owner-WU concept —
  worth weighing as the actual meta field name versus keeping `**Owner:**` with "DRI" as the defining gloss.
  `single-owner-wu-model` deliberately kept `Owner` (accessible, git-idiomatic, zero migration) and used "single
  owner" / "one DRI" as the conceptual gloss; this revisits the field name itself as a deliberate call. A rename is
  a code+data+migration concern — meta template, `meta-reader.ts` parsing, the roster probe (`identity`), the
  ROADMAP `Owner` column render, `arc status`, and every existing meta file — so it sits within this WU's
  rename-cascade scope.

### `[ ]` **Add a `cohort-[name].md` form to the commit `Context:` footer vocabulary**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: naming-conventions`), housekeep drain (2026-06-25); hit
  live committing `cohort-cross-machine-coherence.md`.
- _Concern:_ the `commit-footer` method and the `commit-msg` validator hook enumerate artifact forms for
  `tasks-` / `draft-` / `spec-` / `meta-` (plus `standalone` / `integration` anchors) but carry **no
  `cohort-[name].md` form** — though a cohort doc is a movable spec-shaped artifact that relocates with the WU
  group. Committing cohort-doc grooming has no specific footer and falls back to `standalone (planning)`, losing
  the artifact pointer.
- _Proposed:_ add `Context: cohort-[name].md (planning)` (plus any other parentheticals cohort grooming warrants
  — `(maintenance)`, `(code review)`) to `commit-footer.md` and the `commit-msg` hook validator; mirror to
  package source (two-copy). Small form-set design call: which parentheticals cohort supports.
- _Coordination:_ composes with the commit-msg adherence hook this WU already builds. Sibling of the
  cohort-scoped-grooming-entry capture (`WU_Target: planning-iteration-mechanics`) — same work surfaced both,
  different domain (footer grammar vs. grooming entry).

### `[ ]` **`VECTOR.{PROJECT,USER}` joins the family + explorer-sort as a naming criterion + WU short-name field**

- _Routed from:_ `goal-aware-direction` grooming (2026-07-02). Three related concerns:
- _New TYPE:_ `goal-aware-direction` mints a scope-paired direction surface — `VECTOR.PROJECT` (`backlog/`) /
  `VECTOR.USER` (`user/{id}/`) — named per this convention from the start (the `STATUS.USER` forward-compat
  pattern). A deliberate idiom departure (no mainstream tool uses a navigation metaphor as a surface name;
  rationale recorded in `draft-goal-aware-direction.md`); the entry noun stays plain ("target").
- _Explorer-sort as a codified criterion:_ managed-doc names are chosen with explorer sort order as a design
  input — the intended reading order is `INBOX` → (`MEMORY`) → `STATUS` → `VECTOR`, inbox always first,
  status/vector adjacent, in both scopes. `VECTOR` was selected partly to satisfy this (candidates sorting
  before `INBOX`, e.g. `HORIZON`, were rejected on it). Codify the criterion in
  `strategy-file-classification.md` alongside the convention so future TYPE names get checked against it.
- _WU short-name field:_ a standardized per-WU short name (e.g. `OSD`, `FP`) for width-constrained rendered
  surfaces — a `Short:` (or similar) meta field, minted at `arc stub` with a collision guard, resolvable via
  `arc status <short>`; full name authoritative in prose, short form legal only in constrained render cells.
  Convention + field + collision guard are this WU's; render consumption (overflow collapse `SAP, DM, +4`) is
  `roadmap-tooling`'s (entry routed there 2026-07-02). Coupling: the target `Owner` field on `VECTOR.*` reuses
  the WU field name — the pending `Owner → DRI` evaluation above covers both record types if it lands.

### `[ ]` **Review coupling-audit finding: state document renames**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: naming-conventions`), housekeep drain (2026-07-18);
  captured during `coupling-blast-radius-audit` Task 6.2, 2026-07-18.
- _Concern:_ five planned document/root renames have materially different fan-out, including two abstract
  state-document names.
- _Approach:_ use the ranked classes at grooming to decide which names need resolver-backed indirection and which
  can change atomically with the mover.
- _Packet:_ `packet-9ba27bc90a49239e2b82b1ef`; content digest
  `fbf43e1af8df3fd782b11e52e815f70894d6dab37a03c4c12daca52f6b9cc2cb`.
- _Evidence:_ `agent-briefs-root`, `atomic-inbox-name`, `session-notes-name`, `user-inbox-name`, and
  `working-memory-name`; corresponding `scan-result.json#class-*` anchors.

### `[ ]` **Reconcile the `Context:` footer method with its validator**

- _Routed from:_ `USER-INBOX § Errand` (reclassified multi-step), housekeep drain (2026-07-30); captured during
  `decompose-base-mobility` planning.
- _Concern:_ the prescribed `notes-*` companion family has no valid in-chain footer: the method and validator
  recognize only task, design, and meta anchors. The validator also rejects `(incidental during …)` on a
  `spec-*` anchor even though the method and its discreteness test present that parenthetical as anchor-neutral.
- _Fold-in:_ decide the contract before changing either surface. Give notes companions a chain position with the
  appropriate parentheticals, or explicitly route them through the meta maintenance rung and make diagnostics
  say so. Either admit incidental parentheticals on every in-chain anchor or scope the method per anchor. Update
  the method, validator tables, and refusal suggestions together.

---

### `[ ]` **Re-evaluate the `standalone` context-footer anchor and its parenthetical set**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-19).

- `WU_Target: naming-conventions`

- _Observation:_ this WU already owns "Reconcile the commit-footer meta-category set across method, hook, and
  test", but every thread under it concerns the `Context: meta-*.md (...)` set — `decomposition`, `graduation`, the
  `(activation)` init/activate split, promote / park / resume. The `standalone` anchor is a second, independent
  enum sharing the same three homes, and it has not been looked at: `lib/commit-check/policy.ts` pins it to
  `(maintenance|planning|documentation|refactor|code review)`.

- _Observation:_ that set has no token for an errand whose change is a capability addition. `run-errand` closes on
  `Context: standalone (<kind>)`, and errands routinely land `feat` commits, so a `feat(...)` subject is forced to
  declare itself `(maintenance)` in the same message — the footer contradicts the type, and the parenthetical stops
  carrying the signal it exists to carry. Hit live registering three review request schemas behind `--schema`.

- _Approach:_ settle the token, then reconcile all three homes across both copies exactly as the sibling
  meta-category thread already plans — `commit-footer.md` § Standalone anchor, `STANDALONE_FOOTER_PATTERN` and its
  suggestion strings in `lib/commit-check/policy.ts`, and the footer test. Design fork: add a token (a `feature` /
  `capability` analogue of the meta set's action-nouns), or state that the standalone set is deliberately
  kind-of-work rather than type-of-change and say so where the author is reading. The meta set's legibility
  constraint carries over — the parenthetical must read without ARC knowledge.

- _Boundary:_ the two enums are separate regexes, so neither blocks the other; they belong in one pass for
  coherence, not by dependency.

- _Design fork raised at capture (2026-09-18), and it is wider than adding a token:_ `standalone` may be the wrong
  anchor rather than an incomplete one. The method's own contract is that the footer names the deepest spec-shaped
  artifact and stays grep-searchable, and `standalone` satisfies neither — it names nothing and resolves to
  nothing. Two candidate directions, plus the reason to reject a third:
    - **Anchor on the errand's canonical identity.** An errand carries a `key` and `claimId` and an `originEntry`
      back-pointer to its capture, so `Context: errand-<slug> (...)` resolves to a real record. The branch name
      already carries the slug, but only the merge commit preserves it on the base branch — a per-commit footer is
      durable where that is not. Needs a fallback for partial-protection errands, which have no portable identity.
    - **Prune the parenthetical to what the type does not already carry.** `maintenance`, `documentation`, and
      `refactor` restate the conventional-commit type; `planning` and `code review` do not. The forced
      `feat(...)` + `(maintenance)` contradiction is this duplication surfacing, not a missing token.
    - **Dropping the footer entirely when nothing anchors it** is the weaker option: a required field that is
      legitimately sometimes absent cannot be validated, so the hook loses the ability to tell a correct omission
      from a forgotten one, and the two signals the type cannot carry are lost with it.

- _Captured during:_ the `register-review-request-schemas` errand, 2026-09-18.

### `[ ]` **Rename against derived views and the store's sync verbs**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: naming-conventions`), housekeep drain (2026-09-30); captured
  during `storage-contract` draft close, 2026-09-30.
- _Observation:_ The plan treats `STATUS.PROJECT` as a stored `backlog/` file and names `arc user save` / `load`.
  Under `storage-contract`, derived views are never stored (C2), and user sync moves onto the store, with `arc save`
  as the firing point (C6) and the notes verbs retired at the cutover.
- _Approach:_ Name against the post-cutover surfaces; this work unit already follows the cutover.

## Problem / Motivation

ARC already uses `{TYPE}.{QUALIFIER}` for two paired doc families — `DEV-RULES.{ARC,PROJECT}` and
`AGENT-BRIEF.{ARC,PROJECT}` — but the pattern is half-applied. The inboxes (`USER-INBOX`, `ATOMIC-INBOX`),
the readiness view (`ROADMAP`), and the personal-context files (`SESSION-NOTES`, `WORKING-MEMORY`) do not
follow it, and WF is about to add another surface (its user-scoped in-flight view). Naming that surface in
isolation would entrench the inconsistency; naming the whole system makes every surface legible at a glance.

## The convention

**`{TYPE}.{QUALIFIER}`**, where the qualifier is drawn from a **scope ladder**:

> `ARC` ⊃ `PROJECT` ⊃ `USER` ⊃ `SESSION` — framework, then this project (shared), then this developer,
> then this WU/session.

The TYPE names the kind of document; the qualifier names its scope. Each conforming pair shares both a
TYPE _and an update model_ — that shared update model is _why_ the members share a TYPE (see § Why
`MEMORY` ≠ `NOTES`). Codification home: `strategy-file-classification.md` (which already governs naming
conventions).

One accepted wrinkle: `.PROJECT` contrasts with `ARC` in `DEV-RULES.PROJECT` but with `USER` in
`INBOX.PROJECT` — the contrast member shifts by axis. `.PROJECT` consistently means "project-level"; the
sibling tells you the axis. Not worth solving.

## Renames

| Current                                 | Renamed                       | Scope            | Location           |
| --------------------------------------- | ----------------------------- | ---------------- | ------------------ |
| `USER-INBOX.md`                         | `INBOX.USER.md`               | user             | `user/{id}/`       |
| `ATOMIC-INBOX.md`                       | `INBOX.PROJECT.md` (rename)   | project (shared) | `backlog/`         |
| `ROADMAP.md`                            | `STATUS.PROJECT.md`           | project          | `backlog/`         |
| _(new — WF builds)_                     | `STATUS.USER.md`              | user             | `user/{id}/`       |
| `WORKING-MEMORY.md`                     | `MEMORY.USER.md`              | user             | `user/{id}/`       |
| `SESSION-NOTES.md`                      | `NOTES.SESSION.md`            | session/per-WU   | `user/{id}/<wu>/`  |

Section anchors rename from `## Atomic` / `## Backlog` to **`## Atomic` / `## Work Unit`** — the character
axis ARC already routes on ("inboxes route by character, not wrapper presence"), retiring the bad "backlog"
section name (it collides with the `backlog/` directory). This two-section shape now applies to the personal
`INBOX.USER` only: `work-routing-discipline` retired the shared multi-step surface (homeless multi-step
captures graduate to a provisional stub), so the shared `INBOX.PROJECT` carries `## Atomic` alone. Errand is
_routing language_ inside `## Atomic` (an atomic capture becomes an Errand or folds into current work), not a
section name — name by character, not vehicle.

## Design decisions

**Rename the surviving shared inbox — there's nothing to collapse.** `work-routing-discipline` retired
`BACKLOG-INBOX` (no shared multi-step surface; homeless multi-step graduates to a provisional stub), so the
shared inbox is atomic-only and `ATOMIC-INBOX → INBOX.PROJECT` is a simple rename. This _strengthens_ the
qualifier as a _pure scope axis_ (`USER` / `PROJECT`): the shared surface carries one character section
(`## Atomic`), the personal `INBOX.USER` carries two, and neither mixes scope with character the way a
three-file `INBOX.{USER,ATOMIC,BACKLOG}` would have. The growth concern (a shared surface accumulating) is a
_drain-discipline signal_, not a structural defect — `## Atomic` is designed to empty (atomics done/folded).
Append-contention shrinks to atomic appends alone — pre-existing mutated-state territory per ADR-020,
mitigated by `merge=union` and low in solo/small-team use.

**Why `MEMORY` ≠ `NOTES` (don't unify to `MEMORY.SESSION`).** They have different _update models_, and the
TYPE encodes it: `MEMORY` is an accumulating store of discrete entries, each individually conditioned
(`_Remove when:_`), surviving across many sessions/WUs — you add and prune. `NOTES.SESSION` is a single
snapshot, wholesale-rewritten each handoff — you replace. Every other conforming pair (`DEV-RULES.*`,
`INBOX.*`, `STATUS.*`) shares an update model within its TYPE; unifying these two under `MEMORY` would
create the only pair whose members don't — false symmetry. They also live in different directories, so a
shared TYPE buys no sorting benefit anyway. `MEMORY.USER` joins a clean `.USER` root family
(`INBOX.USER` / `STATUS.USER` / `MEMORY.USER`); `NOTES.SESSION` is correctly the per-WU outlier. (`MEMORY`
is also an accuracy gain over "working memory," which implied transient/active — the file is
persistent-but-pruned.)

**`INBOX.USER`, not bare `INBOX`.** Location alone would disambiguate, but family consistency wins: when
`INBOX.USER` / `INBOX.PROJECT` appear together in prose or globs, the parallel reads cleanly.

**Maintenance mode is not in the name.** Within `.USER`, `STATUS.USER` is derived, `MEMORY.USER` /
`NOTES.SESSION` are agent-maintained, `INBOX.USER` is mixed. Maintenance is orthogonal to scope and varies
within a scope, so it is a documented property (or frontmatter if ever machine-legible), never a filename
component.

## Coordination and dependencies

- **`work-routing-discipline`** (upstream, landed) retired `BACKLOG-INBOX` and settled the inbox shape on
  current names: the personal `USER-INBOX` keeps two character sections, the shared inbox is atomic-only, and
  inbox entries use a uniform `WU_Target` entry grammar. This WU adopts that shape and carries the `WU_Target`
  grammar unchanged through the rename cascade — it renames, it does not reshape.
- **`roadmap-tooling`** owns the `ROADMAP → STATUS.PROJECT` rename (it parked the ROADMAP rename and builds
  the renderer). This WU and roadmap-tooling must agree on `STATUS.PROJECT` and sequence the rename once
  (avoid a double cascade). WF's planning routed the `STATUS` lean there.
- **`handoff-optimization`** carries SESSION-NOTES _content/template_ cleanup (a USER-INBOX § Backlog
  entry). That is distinct from this WU's `SESSION-NOTES → NOTES.SESSION` _filename_ rename, but they touch
  the same surfaces — coordinate so one sweep does both.
- **Worktree Foundation** builds `STATUS.USER` and should name it per this convention from the start
  (forward-compat), even though the rest of the renames land here.
- The item-6 sync dispatch keys on _path/directory class_ (per-WU subdir vs. user root), not filenames, so
  the file renames do not break `arc user save/load` — de-risks the cascade.

## Cascade scope (the real cost)

References to rename live across DEV-RULES (ARC + PROJECT), the session workflows (init / handoff),
strategy docs (file-classification, session-operations, work-organization), templates, CLI paths /
messages, and ROADMAP regen tooling. Mechanical but broad — comparable to the ROADMAP-rename cascade
`roadmap-tooling` already flags. Infra-touching → a planned WU, not atomic.

**Briefs + a stale token to catch.** Include `AGENT-BRIEF.{ARC,CONTRIBUTOR}` in the sweep — they reference the
inboxes in _content_, not just the filename-convention conformance noted above. Specifically,
`AGENT-BRIEF.CONTRIBUTOR` still names the **pre-WOR per-user `ATOMIC-INBOX.md`** (WOR renamed it to `USER-INBOX`);
a `USER-INBOX` → `INBOX.USER` rename grep won't catch the stale `ATOMIC-INBOX` token, so sweep it explicitly to
the renamed surface. Surfaced during Worktree Foundation's atomic-companion retirement, which left this brief ref
untouched as off-axis (inbox rename, not companion-type).

## Open questions

- Final sequencing with `roadmap-tooling` (STATUS.PROJECT) and `handoff-optimization` (SESSION-NOTES
  content) — one combined sweep or staged?
- `STATUS` vs `DASHBOARD` was settled to `STATUS`; confirm no live collision with the `arc status`
  command (different namespace — command vs. file — but the _render command_ should not be named
  `status`).

## Scope Estimate

Small–Medium. No behavioral change; the work is rename + cascade + the file-classification codification.
Size is dominated by reference breadth and cross-WU coordination, not logic.

## Coordination — ADR-022

ADR-022 classifies the managed operational-state documents _by role_ and is rename-agnostic; this WU owns the
file renames (`WORKING-MEMORY → MEMORY.USER`, `SESSION-NOTES → NOTES.SESSION`, `ROADMAP → STATUS.PROJECT`,
etc.). The managed-doc class concept is a motivation for the rename, but timing stays this WU's call. See
`adr-022-managed-operational-state-documents.md` § Coordination.
