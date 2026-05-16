# Atomic Tasks — Work Organization Reform

**Purpose:** Tracking of indivisible one-off tasks you elect to do in parallel to the
planned work — discovered during execution, not required for the work unit's success
criteria. No phases or numbering hierarchy; items are flat parent-level entries under
a single `## Tasks` wrapper.

**Ordering:** Incomplete tasks (`[ ]`) stay at the top. Completed tasks (`[x]`) sink
below them in completion order (oldest completed first). See process-task-loop §
Atomic Task Completion for the full protocol.

> Multi-step work required for the WU belongs in the task list as a new phase.
> For multi-step work outside the WU's concern, see `manage-incidental-work.md`.

---

## Tasks

### `[x]` **Audience-vocabulary sweep — WU docs (PRD + task list)**

- _Outcome:_ Swept both WU docs for `\badopters?\b` (case-insensitive). 14 replacements total:
  8 in `prd-work-organization-reform.md` (R27 `docs` example, R28 method-composition framing, R1
  amendment prose, plus body prose addressing the reader as "adopter"); 6 in
  `tasks-work-organization-reform.md` (outcome notes describing method capabilities, body prose,
  one decision-gate bullet). 38 mentions kept across both files — all surface-category labels
  (`adopter-facing strategy/prose/sweep/...`), historical decision records, and meta-discussion of
  the audience-vocabulary rule itself (essential context that explicitly names the framework-author
  audience). Tier 1 lint clean. Closes the spec-carryover risk that surfaced at 2.13.a; downstream
  phases now port from clean source.

### `[x]` **Workflow-interlock convention codification + Phase 3 application**

- _Outcome:_ Codified workflow-interlock convention in `strategy-workflow-authoring.md` §
  Interlock markers — advance-signal forms (quoted-verb / named-target with direction / approval
  split), trigger-driven embedded placement, standalone-step prohibition, gate-vs-fire separation.
  Applied to Phase 3 boundary workflows: dissolved 2 standalone interlocks in
  `integrate-work-unit.md` (cascade renumber 7+→6+ and 12+→11+); promoted buried commit-fire to
  explicit substep at `1_create-prd.md` Step 7; trimmed stale "last gate" prose at Step 5. Sibling
  sweep across remaining workflows tracked in ATOMIC-INBOX.

### `[x]` **Class-tagged fire-site admonition convention + Implied-approval scope rule**

- _Outcome:_ Codified `[!CAUTION]` admonition pattern for class-tagged fire sites in
  `strategy-workflow-authoring.md` § Routing class tags — shape ``> `<interlock>` release — <verb>
  as `<class>`:`` mirrors interlock-marker shape (gate/fire structural symmetry; both backtick-wrap
  the interlock name). Added "Concept relationship" paragraph + "Implied-approval scope" rule to
  DEV-RULES.ARC § Commit Discipline (gate vs fire vs release ontology + structured-gate discipline
  for off-workflow commits). Added "Incidental Commit Discipline" subsection to process-task-loop
  § Incidental Work Management (task-interlock pattern extension). Applied admonition to all
  class-tagged fire sites across the 5 Phase 3 boundary workflows. ATOMIC-INBOX class-tag
  fire-site cue entry updated — option (4) adopted, options (1)/(2)/(3) superseded.

### `[x]` **Surface active commit/push interlock modes at prompt-composition decision points**

- _Outcome:_ Closed the prompt-prefix lookup gap diagnosed in 93b50a4a's incidental commit
  (defaulted to `manual` framing despite `commitInterlock: on-workflow` active). A1: session-init
  envelope's `config.value.settings` payload extended with `commit.interlock` + `push.interlock`,
  git-config-resolved from `arc.commitInterlock` / `arc.pushInterlock`; types + status handler +
  4 test files updated. A2: DEV-RULES.ARC § Implied-approval scope gained the inline
  prompt-prefix mapping (`Proceed` when `manual`; `Commit and proceed` when
  `on-task-approval` / `on-workflow`) — closes the 2-hop lookup that previously sent agents from
  the rule to `process-task-loop` § Completion protocol for the values. session-init.md Step 1
  envelope-fields table + below-table paragraph document the new keys' source + use. Both copies
  synced. Tier 2 clean: typecheck + lint + tests (1796 + e2e 56). A3 (orientation-surface for
  non-`manual` modes) deferred — decide post-A1+A2 settlement whether always-visible orientation
  noise is worth the salience. Landed b2d8162d.

### `[x]` **Layer 1 review-increment invariant codified in DEV-RULES.ARC + AGENT-BRIEF.ARC + process-task-loop**

- _Outcome:_ Constitutional foregrounding for the universal review-increment invariant — every
  review increment closes with a structured approval gate that precedes any commit invocation,
  wrapped or raw; release wrapper bypasses harness per-invocation prompt but does NOT bypass
  user approval gate. New top-level `## Review-Increment Invariant` section in DEV-RULES.ARC
  above § Commit Discipline plus matching Contents entry; AGENT-BRIEF.ARC vocabulary
  universalized ("one leaf task = one autonomous chunk" → "one bounded chunk of work; applies
  universally — task list work, off-task / incidental, workflow stages"); process-task-loop
  § Incidental Commit Discipline rewritten with cross-ref retarget to the new Invariant section;
  strategy-session-operations § Interlock Model opening cross-ref extended to include the new
  Invariant section. Both copies synced (package source + `.arc/` instance) across all four
  framework files. plan-interlock-release-refinement.md updates: Watch item "Approval-provenance
  gap on direct `arc-commit` invocations" flipped watch → act-pending-design (trigger fired this
  session — agent invoked release wrapper for off-task incidental work after correction, without
  prior structured approval gate); In-Flight wrapper-routing migration gains a note that the
  § Trust Model / § Scope rewrite should fold a § Review-Increment Invariant cross-ref into
  strategy-interlock-release-wrappers.md (deferred from this commit to avoid double-touch ahead
  of the substantive rewrite). Doc-only quick-tier scope; provenance-as-state implementation
  stays deferred to its plan home (plan-commit-increments.md § Unknowns).

### `[x]` **plan-interlock-release-refinement.md: Layer 1 implications applied**

- _Outcome:_ Same-session follow-up to the Layer 1 codification — evaluated whether the
  In-Flight wrapper-routing migration still holds under the new constitutional framing. Net:
  migration holds, Layer 1 strengthens its premise. Plan-doc adjustments applied: In-Flight
  item gains a _Sequencing with approval-provenance guard_ bullet (Layer 1 makes the guard a
  hard dependency of the routing migration, not a follow-up); `releaseRouting` envelope payload
  shape preference flipped from "decide at impl" to single-`commit`/`push` keys parameterized
  by (opt-in × interlock-mode), with `incidentalCommit`-key alternative rejected as
  backward-compat tax; strategy bullet extended with bypass-mode sharpening ("bypass changes
  the wrapper's conditional value layer, not the Layer 1 invariant") and "cite Layer 1, don't
  re-derive" guidance for the rewrite; _Captured during_ line clarified to name the user-intent
  gap explicitly. Watch item's _Trigger fired_ and _Composition_ notes updated to reflect the
  flipped sequencing — guard co-lands with migration, or lands first; migration-first leaves a
  regression window where the routing change makes the observed failure mode easier to hit,
  not harder.

### `[x]` **manifest.json drift: `pre-stage-review.md` → `pre-commit-review.md` entry rename**

- _Outcome:_ Updated `.arc/system/.internal/manifest.json:219` — key renamed
  `system/extensions/pre-stage-review.md` → `system/extensions/pre-commit-review.md`;
  `pristine_hash` refreshed to current `pre-commit-review.md` SHA256
  (`cce3c23a435a8d9c7913ad3b59556bff83b5a570bb0995a54c73a3f759539c65`). Single reference in the
  manifest; no other keyed metadata referenced the old basename. `arc health` separately reports
  other framework files as M-modified — expected in this self-hosting WIP state (no `arc update`
  against itself), not 3.8.b-related drift. Manifest exists only in `.arc/` instance; no
  package-source mirror.
