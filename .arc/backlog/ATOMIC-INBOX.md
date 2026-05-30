# Atomic Inbox

> _Project-shared queue of homeless atomic (single-step) items — single-step captures with no better home. Live
> capture in `user/{identity}/USER-INBOX.md` § Atomic drains here at WU ceremonies; items execute as-is and
> remove on completion. No work-unit stub passes through here: multi-step work always has a stub home, so it
> graduates to a `backlog/{planned,provisional}/<wu-name>/` stub and only genuinely homeless single-step items
> rest in this shared surface. See `strategy-planning-module.md` § Inbox Family._

## Inbox

<!-- Entry shape: H3 + checkbox + bold title (`### `[ ]` **Title**`) + italic-descriptor bullets
(_Observation:_, _Approach:_, _Files:_, _Scope:_, _Captured during:_). -->

### `[ ]` **Audit interlock-marker convention adoption across remaining workflows**

- _Observation:_ `strategy-workflow-authoring.md` § Interlock markers codifies the workflow-interlock
  convention — advance-signal forms (quoted-verb / named-target with direction / approval split),
  trigger-driven embedded placement, standalone-step prohibition, gate-vs-fire separation. It has been applied
  to `integrate-work-unit.md` and `1_create-prd.md` as reference implementations. Other workflows have
  already-embedded interlocks (no standalone-step debt, per survey) but their advance-signal language predates
  the convention — likely bare "await direction" rather than the quoted-verb / named-target forms.

- _Scope:_ Audit + tighten interlock callouts in `2_generate-tasks.md` (Pass 1, Pass 2, Pass 3 / Step 3.2,
  Step 4), `integrate-external-content.md` (Step 12 area), `3_process-task-loop.md` (the `task-interlock`
  callout — different class, same shape rules), and any workflows authored since. Per callout: verify embedded
  placement, retune advance-signal language. Light commit-fire-visibility sweep across the same workflows.
  ~1-2 line edits each. Quick-tier (touches `.arc/system/workflows/`); package-source-primary with `.arc/`
  mirror sync.

- _Captured during:_ work-organization-reform — boundary-workflow interlock codification; remaining workflows
  deferred per touch-once economy.

### `[ ]` **Add mechanical check for `adopter`/`adopters` in adopter-facing surfaces**

- _Observation:_ The "no framework-author-POV `adopter` language in adopter-facing surfaces" rule
  (DEV-RULES.PROJECT § Audience Boundaries) relies on agent attention + manual review. A real slip — an
  "adopter onboarding" example carried verbatim from spec text into `commit-format.md`, caught only at
  pre-commit review — shows that's insufficient.

- _Proposed action:_ Pre-commit hook (or markdownlint custom rule) flagging `\badopters?\b` in staged content
  under the adopter-facing surface set: `.arc/system/**`, `.arc/reference/strategies/arc/**`,
  `.arc/system/rules/DEV-RULES.ARC.md`, `.arc/reference/templates/**`, `.arc/reference/QUICK-REFERENCE.md`, and
  the `packages/arc-framework/arc/**` mirror. Block on match; allowlist mechanism (staged-allow comment or
  per-line ignore) for the rare legitimate use that names the framework-author audience explicitly.

- _Scope:_ Atomic-tier. Hook implementation in `system/githooks/` + allowlist of surface globs + smoke test
  (mirrors the existing `commit-msg` hook + smoke-test pattern). ~30 min. Bundle with the path-style-ref check
  entry below — same shape (forbidden-pattern detection), same hook file; one sweep is more efficient.

- _Captured during:_ work-organization-reform — paired with the DEV-RULES.PROJECT rule promotion that surfaced
  the slip.

### `[ ]` **Add a concrete shape example to `_Outcome:_` bullet guidance in `3_process-task-loop.md`**

- _Observation:_ An agent wrote `_Outcome:_` as a 4-space-indented paragraph (no leading `-`) instead of a
  top-level list item peer to `_Goal:_`, despite reading `3_process-task-loop.md` § Completion protocol and
  `strategy-task-list-formatting.md` § Goal/Note Lines. The prose guidance ("single `_Outcome:_` bullet at
  root — peer to Goal") is correct but verbal; neither doc shows the literal markdown shape. Misparse:
  "bullet" read as "indented descriptor under task" rather than "top-level list item with leading `-`."

- _Proposed fix:_ Add a small code-block shape example near the bullet-at-root prose in
  `3_process-task-loop.md` § Completion protocol (and optionally `strategy-task-list-formatting.md`
  § Goal/Note Lines):

    ```text
    - _Goal:_ <verbatim — preserved across completion>
      <indented description bullets / subtasks>
    - _Outcome:_ <synthesis bullet — leading `-` at parent-Goal column>
    ```

- _Watch-and-wait:_ First observed occurrence (three instances, one session, one underlying gap). Defer
  implementation until recurrence confirms a systemic doc gap vs. a one-off; drop without action if later
  sessions get the shape right unprompted. Quick-tier (touches `.arc/system/workflows/`); both copies.

### `[ ]` **Add a CLI-specific README to `packages/arc-framework/`**

- _Observation:_ `npm view @arc-framework/cli` shows `readmeFilename: ""` for the published `0.1.0` — there is
  no `packages/arc-framework/README.md`, so the npm page for the CLI has no content below the metadata. The
  root README covers the full framework, not the CLI specifically.

- _Proposed action:_ Author a CLI-focused README covering installation, core commands (`arc init`, `arc join`,
  `arc update`, `arc user *`, `arc sync`, `arc log standalone`), basic usage, and a pointer to the full docs
  site. Keep it focused — this is the npm landing page, not the full marketing surface.

- _Scope:_ Content authoring, ~1-2 hours. Has real design decisions (tone, scope boundaries, include vs. defer
  to docs); could scope-creep if it duplicates root-README content. Likely its own branch (`docs/cli-readme`)
  under full protection, unless rolled into a broader content sweep. Land before the next publish.

### `[ ]` **Reframe init-recipe `tools` prompt as harness/tooling, not agent selection**

- _Observation:_ `packages/arc-framework/init-recipe.json` lists ~14 tool options (amp, cline, codex, cursor,
  gemini, copilot, kimi, opencode, warp, windsurf, antigravity, augment, claude). Now that per-agent file
  scaffolding (`{AGENT}.ARC.md`) is retired, this prompt no longer drives file generation — its remaining role
  is signaling where/how to generate `arc-*` skill files for the user's harness (via
  `detectExistingSkillDirs`). The "tools" framing reads as agent-selection, but the substantive use is
  harness-tooling.

- _Proposed action:_ Rephrase the prompt label/help to surface harness-choice semantics ("Which AI
  harness/tooling do you use?"); audit the list (remove dead entries, consider missing ones); keep
  universal-skill-dir detection aligned; verify docs cross-references to "tools" still read coherently.

- _Architectural angle:_ Worth weighing an agent-driven self-scaffold path (precedent: the `add-agent.md`
  workflow handles post-init tool addition) over CLI-prompt-driven recording, with the recipe options demoted
  to a "supported examples" set rather than the menu. Pros: scales with the harness ecosystem; eliminates
  brittle "installed tools" persistent state. Cons: less mechanical at init; requires an active agent session.
  The list/language refresh is needed either way; the architectural choice is the deferred decision.

- _Scope:_ Small for the rename; medium if the self-scaffold path is taken.

### `[ ]` **Clarify the per-phase approval flow in `2_generate-tasks.md` (audit pass)**

- _Observation:_ The audit-pass workflow body (`2_generate-tasks.md` § Step 3.2) says "Stop after the audit
  findings and corrections are applied per phase" — reads as: apply corrections, then stop. In practice the
  cleaner pattern is: surface findings, pause for review of proposed corrections, get approval, apply, then
  proceed to the next phase; approving one phase's corrections is also implicit permission to proceed to the
  next phase's audit without re-prompting. Current wording makes neither pattern explicit.

- _Proposed fix:_ Tighten the `workflow-interlock` block to say: "Surface findings + proposed corrections per
  phase; await direction before applying. Approval of corrections cascades to permission for the next phase
  audit." Quick-tier; ~3-line edit in both `2_generate-tasks.md` copies.

### `[ ]` **Session-init probe: detect local base-ref staleness vs `origin/<base>`**

- _Observation:_ The session-init worktree probe compares only the current branch against its upstream. Local
  `main` (or any base ref) can fall arbitrarily behind `origin/main` when cross-machine integration lands on a
  sibling clone — the integrating machine fast-forwards local `main` as a merge side-effect, the sibling clone
  never does, and orientation carries no signal. Observed live: a machine's local `main` 47 commits behind
  `origin/main`. The defensive at-branch-creation check already shipped; this captures the probe-side
  extension that surfaces the gap before branch creation.

- _Proposed action:_ Extend the session-init probe envelope with a `baseBranchSync` slot mirroring the existing
  `worktree` slot (`state`, `ahead`/`behind`, `recommendedAction`, `recommendedPromptText`). New config key
  `session.init_pull.main` ∈ `{always, prompt, surface, skip}`. Surface in orientation when behind; probe is
  read-only (fetch + compare), pull action config-gated. Touch points: probe handler in
  `packages/arc-framework/src/`, envelope types, `session-init.md` (probe / dispatch / orientation),
  `arc-config.yml` template comments, QUICK-REFERENCE.

- _Scope:_ Quick-tier. Architecturally bounded (mirrors the worktree channel); ~30-50 lines TS + tests +
  workflow doc updates. Cross-reference `cross-machine-sync-coherence` at promotion (both are "machine B
  unaware of machine A's state change," different mechanism classes).

### `[ ]` **Mechanical check for path-style refs to movable WU artifacts**

- _Observation:_ DEV-RULES.ARC § Documentation Boundaries requires movable WU artifacts (`plan-*`, `prd-*`,
  `tasks-*`, `meta-*`, companions) to be referenced by backticked filename only — no Markdown links or paths.
  No mechanical enforcement exists. A migration sweep found ~14 non-compliant path-style refs across 9 files;
  most predated the rule's codification, and the cleanup sweep wasn't run.

- _Proposed action:_ Pre-commit hook (or markdownlint custom rule) flagging staged path-style refs to movable
  WU artifacts — absolute-with-leading-dot and bare `(active|backlog)/.../(prd|plan|tasks|notes|meta|atomic)-*.md`
  paths, plus Markdown link definitions / inline links to the same. Allowlist fenced code blocks (legitimate
  tooling examples) and historical records in completion/outcome notes.

- _Scope:_ Atomic-tier. Hook in `system/githooks/` (mirrors the `commit-msg` hook + smoke-test pattern) or a
  markdownlint custom rule + surface globs + smoke test. ~30-60 min. Bundle with the `adopter`/`adopters` check
  entry above — same shape, same hook file.

### `[ ]` **Migrate remaining `commit-msg` hook subdir-loops off `active/*/` to flat-root checks**

- _Observation:_ The `commit-msg` hook's TASK-LIST scanner was migrated from an `.arc/active/*/` subdir-loop to
  a flat-root check. Two similar subdir-loops remain in the same hook (both copies) — around
  `.arc/system/githooks/commit-msg` lines 266 (`for dir in .arc/active/*/ .arc/backlog/*/`) and 285
  (`for dir in .arc/active/*/`), plus a line ~305 needing a context check. These fire stale "Meta file not
  found in active directories" warnings on handoff and archival commits now that the meta file lives at flat
  `.arc/active/` (and leaves it entirely at archival). Non-blocking, but noisy and procedurally wrong.

- _Proposed action:_ Same fix shape as the task-list-scanner migration — replace each subdir-loop with a
  flat-root file-existence check, and make the `(archival)` footer case `completed/`-aware so the post-sweep
  archival commit doesn't warn. Both copies mirror byte-identical. (This is the concrete hook fix behind the
  stale-warning facet noted in the BACKLOG-INBOX "archival ceremony tooling" entry.)

- _Scope:_ Atomic-tier. ~3 surgical edits per copy + optional hook smoke test.

### `[ ]` **Split `supplemental/` workflows into session-adjacent vs installation-level**

- _Observation:_ `.arc/system/workflows/arc/supplemental/` mixes two implicit categories: framework-level
  one-offs (`add-agent.md`, `integrate-external-content.md`, `verify-arc-integrity.md`, and a future
  `switch-mode.md`) and session-work-adjacent helpers (`manage-incidental-work.md`, `maintain-project-docs.md`,
  `prepare-commits.md`). The split is implicit in the directory but not structurally expressed.

- _Possible cleanup:_ Create a sibling `installation/` directory, move the four framework-level workflows,
  leaving `supplemental/` cleanly session-adjacent. Atomic move of 4 files + reference updates in DEV-RULES.ARC
  and workflow cross-references. Cleanup-eligible any time.

### `[ ]` **Update SESSION-NOTES template's stale `status-` marker reference**

- _Observation:_ `packages/arc-framework/templates/user/SESSION-NOTES.md` § Handoff Metadata carries a
  `**Working On:**` example listing `status-{name}.md`. The status→meta rename swept hooks, scripts,
  validators, and active meta files but missed this template comment, so a fresh `arc init` ships a template
  referencing a retired filename token.

- _Fix:_ Update the example to `meta-{name}.md`. Mechanical single-line edit (cross-reference-sweep territory).

### `[ ]` **Resolve SESSION-NOTES `## Completed Work` vs `## Uncommitted Work` divergence**

- _Observation:_ The SESSION-NOTES template uses `## Completed Work`; instance practice used
  `## Uncommitted Work`. Different concepts — "what got done this session" vs. "work done but not committed
  (needs recreation as proper atomic commits on resume)". The template body conflates them: its description
  bullet opens "For uncommitted work, use commit-level granularity…" under a section named "Completed Work".

- _Decision needed:_ Which semantic is canonical? The "Uncommitted Work" framing likely matches the handoff
  use case better (finished, committed work needs no detailed handoff prose — git history carries it). Decide,
  rename the template section, tighten the description, update any references.

### `[ ]` **H1 styling for the inbox / working-memory file family**

- _Observation:_ The user-scoped capture surfaces — `SESSION-NOTES.md`, `WORKING-MEMORY.md`, `USER-INBOX.md`,
  `BACKLOG-INBOX.md`, `ATOMIC-INBOX.md` — use Title Case H1s (`# Session Notes`, etc.). Alternative:
  filename-style ALL-CAPS-HYPHENATED H1s (`# USER-INBOX`), which add visual weight and make file identity
  instant in raw-markdown views (the primary consumption mode), at the cost of diverging from standard H1
  convention and looking shouty when rendered. Half-measure: space-separated all-caps (`# WORKING MEMORY`).

- _Scope if accepted:_ 5 templates + instances + any cross-doc references quoting H1s. Small ripple. Defer;
  revisit at leisure.
