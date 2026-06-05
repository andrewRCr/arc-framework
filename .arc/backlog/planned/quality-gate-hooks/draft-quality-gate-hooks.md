# Draft: Quality Gate Tiers and Hook Integration

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Enhanced link validation — reference-style compliance + hook hardening**

- *Routed from:* `BACKLOG-INBOX`, work-routing-discipline retirement pass (2026-06-01). Folded here because the
  hook-hardening lobe is a tier-to-hook-stage check (Tier 3 + CI) this WU owns; the link-reanchor counterpart
  routed to `roadmap-tooling` (lifecycle file-move CLI).
- *Concern:* two related gaps surfaced when LSP integration revealed mixed link styles and stale cross-file
  references the existing `validate-links.sh` pre-commit hook didn't catch. (a) DEV-RULES.PROJECT
  § Documentation Standards prefers reference-style for cross-file links, but the codebase is mixed. (b) The hook
  validates only staged files — when a file is moved/renamed (e.g., archival), broken outgoing links from
  un-staged files go undetected (a stale archived-WU reference surfaced long after archival).
- *Proposed (two lobes; can split):* (1) **Reference-style compliance sweep** — audit `.arc/` and the
  `packages/arc-framework/arc/` mirror; convert inline `[text](../path/to/file.md)` cross-file links to
  reference-style with an EOF link block (same-directory / one-level-up targets may stay inline). (2) **Hook
  hardening** on `validate-links.sh` — a `npm run lint:links` whole-tree scan wired into Tier 3 + CI; expanded
  candidate set when commits delete/rename `.md` files; optional anchor validation for `file.md#section`;
  optional dup-definition detection.
- *Scope:* M overall (S for hook hardening; S–M for the sweep, link-volume dependent).

### `[ ]` **Forbidden-pattern pre-commit checks: adopter-language + path-style WU-artifact refs**

- *Routed from:* `ATOMIC-INBOX`, shared-inbox sweep (2026-06-02) — two captures bundled (each flags "same
  shape, same hook file" as the other).
- *Concern:* two mechanical content rules currently rely on agent attention + manual review, and both have
  drawn real slips. (a) **`adopter`/`adopters` in adopter-facing surfaces** — DEV-RULES.PROJECT § Audience
  Boundaries forbids framework-author-POV `adopter` language in the adopter-facing surface set; an "adopter
  onboarding" example slipped into `commit-format.md`, caught only at pre-commit review. (b) **Path-style refs
  to movable WU artifacts** — DEV-RULES.ARC § Documentation Boundaries requires backticked-filename-only refs;
  a migration sweep found ~14 non-compliant path-style refs across 9 files, with no mechanical enforcement.
- *Proposed:* a pre-commit hook (or markdownlint custom rule) flagging each forbidden pattern in staged content
  — `\badopters?\b` under the adopter-facing surface globs, and path-style
  `(active|backlog)/.../(prd|plan|tasks|notes|meta|atomic)-*.md` refs (plus link defs) elsewhere. Allowlist
  mechanism for the rare legitimate framework-author-audience use and for fenced code blocks / historical
  completion-note records. Mirrors the existing `commit-msg` hook + smoke-test pattern; one sweep for both
  (same hook file).
- *Scope:* Atomic-tier each (~30-60 min); bundle as one. Sibling of the link-validation hook-hardening buffer
  entry above — all three are staged-content pre-commit checks this WU's hook-integration surface can absorb (or
  consciously reject against the § Out-of-scope "existing structural CHECKs are framework-owned" line).

### `[ ]` **Relocatability enforcement: source-side movable-artifact link-defs (hook + sweep)**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: quality-gate-hooks`), agile-wu-lifecycle cohort housekeep
  drain (2026-06-04). The original capture bundled two structural guards under one hook file; graduation split
  ownership — this is the **relocatability** half (`class-model-foundation` § Scope routes relocatability
  *enforcement* here), the **cohort↔dir** half re-homed to `decomposition-machinery`. Captured 2026-06-03.
- *Concern:* DEV-RULES.ARC § `.arc/` artifact references is framed target-side ("don't link *to* a movable
  artifact"); the dual is a movable artifact's *own* outbound relative-path links, which break when it moves
  between lifecycle dirs — even links to stable docs. A sweep found ~38 path-style link-defs in active/backlog
  movable artifacts today.
- *Proposed:* extend this WU's already-captured forbidden-pattern hook (the sibling "Forbidden-pattern
  pre-commit checks" entry above) to also flag source-side path-style link-defs inside movable artifacts, and run
  the ~38-def sweep. This is the enforcement half of the AWL relocatability invariant — the *rule generalization*
  itself is owned by `class-model-foundation` (its "Generalize the movable-artifact reference rule" buffer entry).
- *Coordinates with:* the cohort-field↔dir guard in `decomposition-machinery` (same original capture, sibling
  hook-file family) and the rule-side entry in `class-model-foundation`.

### `[ ]` **Markdown-formatting enforcement: table-align auto-fix + emphasis/emoji rules at commit-gate**

- *Routed from:* the `markdown-formatting` WU (`../markdown-formatting/draft-markdown-formatting.md`),
  2026-06-05. That WU owns the markdown *content hygiene* (adopting `markdown-table-formatter`, the
  emphasis MD049/MD050 convention, the emoji-ban rule, one-time sweeps); **this entry is the
  *enforcement* half it routes here** — the user's explicit (b)+(c) routing.
- *Concern:* once `markdown-formatting` lands the fix-commands + lint rules, nothing auto-enforces them.
  Table alignment in particular is *not* gated by `lint:md` today (verified: `MD060` enforces per-file style
  consistency, not width-alignment in general), so it needs an explicit gate.
- *Proposed (maps onto this WU's existing scope):* (b) **CI gate** — add `npm run -s format:tables:check`
  as a `ci.yml` step beside `lint:md`; (c) **pre-commit auto-fix dispatch** — run `format:tables` (auto-fix)
  on staged markdown in the commit-gate Tier-1 dispatch with **auto-restage** (exactly this WU's
  "Pre-commit tier 1 dispatch" + "this repo's own adoption as dogfood" scope). The emoji-ban + emphasis
  rules ride `lint:md` automatically (markdownlint config), so they need no separate gate beyond `lint:md`
  already being in CI. Doing (b)/(c) **before** the auto-fix hook exists would just produce CI failures
  contributors hand-fix — so this lands *after* `markdown-formatting` ships its fix-side.
- *Scope:* S — composes this WU's commit-gate dispatch with one more auto-fix command + one CI step.
- *Coordinates with:* `markdown-formatting` (owns the fix-commands/rules; this owns the gate wiring).

---

## Problem / Motivation

ARC's tiered quality gate system — Tier 1 (per-task), Tier 2 (coherent unit), Tier 3 (pre-PR) — is
workflow-oriented: it tells developers/agents *when in their flow* to run which checks. The methodology
is sound, but the execution model has two gaps:

**1. No automatic enforcement at commit/push stages.** Pre-commit hooks at `.arc/system/.internal/githooks/pre-commit`
enforce structural properties (commit format, context footer, task staging, frontmatter validation, etc. —
14 CHECKs as of 2026-04-24). They do NOT run the adopter's linters or tests. The assumption has been that
agent/developer discipline plus CI is sufficient. In practice this creates a gap: a commit landed on
2026-04-24 with known-deferred markdown lint errors that Tier 2 would have caught, but Tier 2 hadn't run
because the task wasn't "coherent unit" complete yet. CI went red; the agent committed through the
discipline window. This is the kind of preventable failure that hooks exist to prevent.

**2. Tier semantics don't map explicitly to standard git hook stages.** External research (completed
2026-04-24) confirmed the universal idiom: pre-commit (fast, staged files only) → pre-push (full local)
→ CI. ARC's tiers correspond naturally — Tier 1 ↔ pre-commit, Tier 2 ↔ pre-push, Tier 3 ↔ CI — but this
alignment is nowhere expressed in the methodology, so adopters can't take advantage of auto-enforcement
without inventing their own mapping. Pre-push is particularly underserved: there is no ARC-recognized
pre-push stage at all.

**Related concerns surfaced during discussion:**

- **Tier vocabulary.** "Tier 1 / 2 / 3" is generic and requires readers to remember the mapping. The
  vocabulary question is more substantive than first framed — see § Relationship to Interlock Model
  Frame and § Alternatives for the kind-vs-gate-vs-cadence distinction surfaced during cross-plan
  alignment work. Three viable paths captured under Alternatives; PRD-time decision.
- **Structural vs. adopter-impl separation.** The line between *what ARC enforces* (commit format,
  frontmatter schemas, task staging — framework-owned) and *what's adopter-configurable* (linters, tests,
  typecheck, build — stack-dependent) is fuzzy in current docs. ARC should define the tier abstraction +
  enforcement surfaces + connection points, but never assume a specific tech stack in its shipped
  defaults. Hook-manager integration already handles this at the manager layer (ADR-014: detect and
  integrate with husky / lefthook / pre-commit.com, fall back to `core.hooksPath`); the equivalent
  discipline needs to apply to tier-gate *commands*.

This matters now because:

- Pre-1.0 polish window — the methodology shouldn't ship underspecified on a surface this central.
- Dogfooding (upcoming in the release path) will compound the discipline-window gap for real adopters.
  We want the safety net in place first.
- External research is complete; no blocking unknowns before PRD drafting.

## Relationship to Interlock Model Frame

[ADR-016][adr-016] established configurable autonomy **interlocks** for session-operational flow at
four architectural junctions: task, commit, push, integration (delivered via the Session-Operational
Flow WU, May 2026). This plan and the shipped interlock model share **junction prefixes** (`commit-`,
`push-`, `integration-`) but attach different concerns at each junction:

| Junction       | Autonomy concern (interlock model)   | Validation concern (this plan)                    |
|----------------|--------------------------------------|---------------------------------------------------|
| commit         | commit-interlock (approval hold)     | commit-gate (deadline for fast checks)            |
| push           | push-interlock (approval hold)       | push-gate (deadline for medium checks)            |
| integration    | integration-interlock (approval hold)| integration-gate (deadline for full suite)        |

This factoring resolved an earlier proposal where both plans converged on identical "gate" naming.
That convergence collapsed two distinct concepts (validation deadlines vs. approval mechanisms) into
one term. The current factoring keeps them lexically distinct while preserving the architectural
relationship.

Impacts on scope:

- **Pre-handoff hook placement.** The interlock model treats handoff as an orthogonal ceremony, not
  a junction in the linear stack. Hook placement still gains a pre-handoff stage for session-close
  validation (status-file rotation validity, git-notes consistency, worktree cleanliness) —
  attaching as a hook stage on the ceremony, parallel to commit/push/integration gates.
- **Interaction with shipped autonomy modes.** Under the shipped interlock-release cascades
  (`commit_interlock: on-task-approval`, `push_interlock: on-sync`, `sync_interlock: on-handoff`,
  etc.), hook invocation timing changes slightly — hooks fire as part of the cascade rather than as
  standalone gates. The cascade-visibility requirement from ADR-016 means hook output remains visible
  to the user even under cascade modes. Plan needs to confirm hook behavior composes cleanly with
  cascade semantics.
- **Tier-rename framing decoupled from autonomy-vocab alignment.** The original motivation for
  renaming Tier 1/2/3 partly rode on shared "gate" vocabulary with the autonomy plan. With that
  alignment dissolved, the rename's case stands on its own merits — and on inspection, the rename
  is more substantive than originally framed. See § Alternatives for the three viable paths.
- **Integration-gate vs. pr-gate naming.** No longer rides on autonomy-vocab alignment. The case
  for "integration-gate" now stands on lifecycle-ceremony naming (matches `integrate-work-unit`,
  `integrate-planning-branch` workflows) rather than vocabulary mirroring. PR-gate remains a
  platform-specific alternative; current lean stays integration-gate for ceremony-name fit.

Scope impact: roughly unchanged from prior framing. The relationship to the autonomy plan is
clarified rather than expanded; tier-vocabulary work becomes more deliberate rather than larger.

## Scope

### In scope

**Tier model reshape.** Rework tier vocabulary to surface the kind / cadence / gate distinction more
clearly. Three viable paths captured under § Alternatives:

- **A — Gate-only.** Replace Tier 1/2/3 with `commit-gate / push-gate / integration-gate` (deadline
  semantic). Cost-class and opportunistic-cadence guidance becomes advisory convention attached to
  each gate's documentation.
- **B — Orthogonal axes (current lean).** Factor kind / cost-class (cheap / medium / heavy or
  similar) and gate (deadline) as separate concepts. Drop tier numbers; keep cost-class concept;
  add gate as orthogonal deadline naming. Cadence becomes a third (advisory) axis. Most accurate
  factoring; higher documentation surface.
- **C — Status quo with deadline-semantic clarification.** Keep Tier 1/2/3 as-is. Add gate-as-
  deadline framing as a clarifying overlay. Lightest touch; tier-numeric ambiguity persists.

Whichever path lands, the rename touches DEV-RULES.ARC, strategy-quality-gates.md,
3_process-task-loop.md, QUICK-REFERENCE.md, session-init.md, and scattered tier references throughout
the framework. PRD finalizes the path.

**Pre-push hook as recognized stage.** New `.arc/system/.internal/githooks/pre-push` that dispatches to the
adopter's push-gate commands. Config-gated via `hooks.pre_push` in `arc-config.yml`. Integrates through
the existing hook-manager detection layer (ADR-014) — husky / lefthook / pre-commit.com / fallback all
get the pre-push stage wired up.

**Pre-handoff hook as new stage (interlock-model integration).** Additional hook placement for
handoff ceremony: session-close validation before handoff artifacts are finalized. Config-gated via
`hooks.pre_handoff` (naming TBD at PRD, aligned with the shipped autonomy-axis naming under
`session.*_interlock` in `arc-config.yml`). Complements commit-gate and push-gate checks with
handoff-specific validation — e.g., status-file rotation validity, git-notes consistency, worktree
cleanliness.

**Connection points between tiers and hooks.** Extend the `quality-gate-commands` method with tier
metadata on each command (Option A from decision analysis — tier attached to each command entry, not
split across multiple methods). Hook CHECKs read the method, filter by current stage, and run matching
commands against the appropriate scope (staged files for commit-gate; full repo for push-gate).

**Pre-commit tier 1 dispatch.** New CHECK in the existing pre-commit hook: runs commit-gate commands
on staged files only. Staged-files scoping follows universal idiom (`git diff --cached --name-only
--diff-filter=ACM | grep ext`). Auto-fix where supported (e.g., `markdownlint-cli2 --fix`,
`eslint --fix`); auto-re-stage fixed files (aligned with husky + lint-staged default behavior and
research recommendation). The current `--no-verify` prohibition in DEV-RULES.ARC stays unchanged.

**Bootstrap during initial-setup.** Add a step to `.arc/system/workflows/arc/initial-setup/` (exact
placement TBD at PRD) that prompts the adopter to configure their gate commands per tier. ARC ships
no tech-stack defaults in the method — the adopter declares what runs at each gate for their stack,
once, at setup time. Examples for common stacks go to the docs site, not into the shipped method.

**Explicit structural-vs-adopter-impl separation.** Add or extend a section (likely in
strategy-quality-gates.md) naming the distinction. ARC enforces structural checks (14 current CHECKs +
new gate-dispatch CHECKs for 2 stages); adopters configure tier commands via the method. Hook-manager
choice (husky, lefthook, pre-commit.com, fallback) is adopter-impl, already handled via ADR-014.

**Docs routing for common-stack examples.** JS/TS (husky + lint-staged wiring), Rust (cargo fmt/clippy),
Go (gofmt + golangci-lint), Python (pre-commit.com) — route to `notes-docs-content-sweep.md` for
eventual docs-site placement. Not live framework reference docs; those stay stack-agnostic.

**This repo's own adoption as dogfood.** After the framework-level dispatch shape lands, wire this
repo into it in the same WU as a final validation phase. Mechanical configuration: install
`lint-staged`; replace the `scripts/check-ts-quality.sh` stopgap with commit-gate dispatch through the
new method shape; configure staged-file Markdown, TypeScript, and shell checks in the repo-local
hook path. This is not a shipped ARC default and does not select a stack for adopters — it validates
that the adopter-configurable path works on ARC's own JS/TS stack.

**Changed-file Markdown under-wrap detector as repo dogfood.** Include this repo's custom under-wrap
detector in the same dogfood phase, but only as a staged/changed-file commit-gate check. Do not register
it as a normal repo-wide markdownlint rule yet; current repository history has too much existing
under-wrap debt for global blocking enforcement to be useful.

Prototype result from 2026-05-11:

- Implementation shape: markdownlint custom rule using the `markdownit` parser, inspecting
  `paragraph_open` token maps against `params.lines`. For each non-final physical line in a multi-line
  paragraph, flag only when `line.length < min`, the first word of the next line exists, and joining
  that first word would stay within the 120-char target.
- Initial defaults: `min=75`, `max=120`, blockquotes skipped, lint-only/no auto-fix. Skip hard breaks,
  reference definitions, table-like pipe rows, structural field clusters (`**Field:**` lines), and
  standalone bold labels (`**Task level:**`) to avoid ARC-specific false positives.
- Calibration against representative ARC artifacts: `min=70` found 52 candidates, `min=75` found 81,
  and `min=80` found 162 across active/workflow/strategy/template/archive samples. `min=75` gave the
  best first-pass signal.
- Current-core samples at `min=75`: 18 candidates across task-list/workflow/DEV-RULES/WOR files; work
  organization docs produced 16 more, while `docs/reference/task-lists.md` and `session-handoff.md`
  produced zero.
- Full current markdownlint scope at `min=75`: 458 candidates across 221 files. This confirms the
  rule should be changed-file-only until a cleanup/baseline strategy exists.

**Gate-coverage drift detection.** Configured gate commands drift over time as projects add new scripts —
additional typecheck variants (production vs. test tsconfig), evolving lint surfaces, separate test tiers.
Initial-setup captures the configured set at one moment; nothing re-checks coverage as the project grows.
Promoted to a first-class deliverable based on four confirmed recurrences in this repo's self-hosting
codebase (2026-04-23 eslint+typecheck, 2026-05-05 `typecheck:test` not wired locally, 2026-05-06
`typecheck:test` on test-mock signature, 2026-05-08 audit-log fixture used a stale `NotesPushPolicy`
literal — caught by `typecheck:test` but missed by the project-default `typecheck` script) — the pattern
is real, not hypothetical. Deliverable: an
`arc check-gates` audit that compares detected ecosystem scripts (npm `package.json` scripts; equivalents
for other ecosystems) against configured gate commands and flags omissions. Re-runnable any time;
initial-setup invokes it implicitly. PRD finalizes cross-ecosystem detection heuristics and the
false-positive boundary (which detected scripts are gate-relevant vs. not).

**Audit and consolidate workflow-embedded quality-gate triggers.** Before PRD, sweep
`.arc/system/workflows/**` for quality-gate steps embedded in workflow prose — don't trust any existing
inventory. Catalog each (workflow + step + gate type + scope) and decide per item whether the new
dispatch model subsumes it. Consolidation criterion: mechanical-and-now-hook-covered → remove from
workflow; human-judgment-gated or scope-the-hook-can't-see → keep in workflow. Known triggers as of this
WU: `session-handoff.md` step 3's status-file markdown lint substep (added as stopgap during
user-sync-ux); `3_process-task-loop.md`'s Tier 1 / Tier 2 invocations; `verify-work-unit.md`'s Tier 3
invocation. The catalog likely surfaces more. Repo-local dogfood consumers in this plan are the
lint-staged adoption migration and the custom under-wrap markdownlint prototype as a changed-file-only
commit-gate check. They validate the framework dispatch shape but remain repo-local configuration, not
shipped ARC defaults.

### Out of scope

- Switching ARC's shipped hook script format (stays shell-based in `.arc/system/.internal/githooks/`).
  Hook-manager integration is already handled per ADR-014.
- Rewriting or consolidating the existing 14 structural CHECKs. Framework-owned and fine.
- Tech-stack-specific defaults in the shipped method. Configuration at initial-setup is the entry
  point, not shipped defaults.
- Tier 3 auto-enforcement at the hook layer. Tier 3 = CI + human review; no local hook equivalent
  planned. Possible `pre-pr` dispatcher can come later if demand emerges.
- Lint tool selection opinions. ARC doesn't pick between markdownlint and prettier for adopters.

## Alternatives

**Tier vocabulary:**

Background: traditional SWE practice (external research, 2026-04-28) treats three concepts as
conceptually orthogonal even when they correlate in convention:

- **Kind / cost class** — inherent expensiveness of a check (cheap-fast lint/types vs. medium unit
  tests vs. heavy integration/e2e). Property of the check itself.
- **Gate / deadline** — the must-pass-by point. "Push-gate" universally reads as "must have passed
  before push," not "runs at push." Industry convention (Google SWE book, Zuul, CI/CD literature).
- **Cadence** — opportunistic schedule for when checks fire (on-save, on-commit-attempt,
  on-coherent-unit, etc.). Separate from the gate enforcement.

Today's "Tier 1/2/3 = per-task / per-coherent-unit / pre-PR" bundles all three into one tier name.
The original "rename to commit-gate/push-gate/pr-gate" framing collapsed kind+cadence into gate
naming — closer to a category change than a naming swap. Three viable paths:

- **A — Gate-only.** Replace Tier 1/2/3 with `commit-gate / push-gate / integration-gate` (deadline
  semantic). Cost-class and cadence become advisory convention documented per gate. Self-documenting,
  idiomatic, aligns with git hook stages. Downside: drops the explicit kind framing the tiers
  currently provide.
- **B — Orthogonal axes (current lean).** Factor kind and gate as separate vocabulary. Drop tier
  numbers; keep cost-class concept (rename it — "cheap / medium / heavy" or similar); add gate as
  orthogonal deadline naming. Cadence becomes a third (advisory) axis. Most accurate factoring.
  Highest documentation surface; reader must learn two axes instead of one.
- **C — Status quo cleanup.** Keep Tier 1/2/3 as canonical. Add gate-as-deadline framing as a
  clarifying overlay (every surface documents "Tier 1 must have passed by commit-gate"). Minimal
  churn; tier-numeric ambiguity persists; readers must still learn the mapping.

The earlier-framed Option B (keep numeric, document alignment) collapses into Option C above.
The earlier-framed Option C (hybrid dual-naming) is dominated by Options A or B and is dropped.

**Pre-push opt-in model:**

- **A — Config-gated smart default (current lean).** `hooks.pre_push: auto | enabled | disabled`.
  `auto` = "enabled if push-gate commands are configured, disabled otherwise." Zero friction for
  adopters without a test suite; auto-wires for those with one.
- **B — Always opt-in.** `hooks.pre_push: enabled | disabled`, default `disabled`. Explicit, no
  surprises, but misses the easy win for mature adopters.
- **C — Always on (when configured).** No config key; pre-push always enabled if push-gate commands
  exist. Surprising for early-stage projects that just added tests and aren't ready for pre-push yet.

**Method dispatch shape:**

- **A — Extend `quality-gate-commands` with stage metadata (current lean).** Each command entry
  includes `stage: commit-gate | push-gate | integration-gate` (or equivalent under chosen tier-
  vocabulary path). Hook filters by stage, runs matching commands. Single method, expressive.
- **B — Separate method per stage.** `commit-gate-commands.md`, `push-gate-commands.md`,
  `integration-gate-commands.md`. More files, less flexible, harder to misconfigure but harder to
  reason about holistically.
- **C — Flat commands + side-channel stage map.** Commands stay flat; a sibling method maps stages
  to command subsets. More indirection, less cohesion.

**Auto-restage behavior on fix:**

- **A — Auto-restage (chosen).** Aligned with research + husky/lint-staged default + user preference.
  Linter fixes get staged automatically; commit proceeds. Fast, agent-friendly.
- **B — Block and report.** Linter fixes happen but commit is blocked; user/agent re-stages
  manually. More explicit, more friction.

## Unknowns and Assumptions

**External research (completed 2026-04-24) validated:**

- Staged-files-only discipline is universal best practice — no significant dissent.
- Pre-commit time target: <500ms ideal, <5s acceptable, >10s corrodes discipline.
- Tier 2 equivalent (full test suite) in pre-commit is a documented anti-pattern — belongs in
  pre-push or CI.
- Agent-friendly hook design: structured errors, auto-fix, idempotent retries. Claude Code has 15
  hook events and documented patterns for agents reacting to hook failures.
- `--no-verify` bypass pressure scales inversely with hook speed and signal density.

No external research blockers remain before PRD drafting.

**Assumptions to validate during PRD:**

- The chosen tier-vocabulary path (A/B/C per § Alternatives) produces net-positive readability
  despite methodology churn. If PRD discovery finds the rework touches >50 files or disrupts
  established mental models, fall back to Path C (status quo cleanup).
- `hooks.pre_push: auto` default works for both early-stage adopters (no tests yet) and mature ones
  (has tests). If beta dogfooding reveals confusion, fall back to explicit opt-in.
- Initial-setup is the right configuration point. If the bootstrap step adds material friction to
  onboarding, consider making it an optional later step.
- Extending `quality-gate-commands` with tier metadata (Option A) stays readable as commands
  accumulate. If the method becomes crowded in practice, revisit splitting.
- Auto-re-stage behavior is safe when combined with ARC's existing structural CHECKs. Needs test
  coverage ensuring re-staged fixes don't re-trigger or loop.
- **`arc check-gates` audit heuristics.** The drift-detection deliverable is now in scope (see § Scope >
  In scope > Gate-coverage drift detection); four recurrences in this repo's self-hosting codebase
  (2026-04-23, 2026-05-05, 2026-05-06, 2026-05-08 — all variants of "test typecheck never wired to local
  enforcement") closed the "is this real?" question. Open at PRD time: cross-ecosystem detection (npm `package.json`
  scripts vs. cargo `Cargo.toml` aliases vs. Make targets vs. justfile recipes), the heuristic for
  classifying detected scripts as gate-relevant vs. not (false-positive surface), and surfacing cadence —
  re-runnable command vs. opportunistic warning at session-init or push-gate dispatch.

## Scope Estimate

**Medium** (days-week).

Rough breakdown:

- Tier-vocabulary rework + doc sweep (Path A or B per § Alternatives; Path C is lighter): 1-2 days.
- Pre-push hook + structural CHECK + two-copy sync: 0.5-1 day.
- Method extension + dispatch logic + tests: 1 day.
- Initial-setup bootstrap workflow edit + tests: 0.5 day.
- `arc check-gates` audit command + cross-ecosystem detection + tests: 1-1.5 days.
- Docs-content-sweep routing entry: 0.25 day.
- Config schema update + CI audit updates: 0.5 day.
- Repo dogfooding: lint-staged wiring, stopgap replacement, and changed-file under-wrap check:
  0.5-1 day.

**Dependencies:**

- **Session-Operational Flow** — shipped May 2026. Interlock-model vocabulary and architectural-junction
  naming are canonical; the `session.*_interlock` config surface in `arc-config.yml` is the
  authoritative reference for `hooks.pre_push` / `hooks.pre_handoff` config shape. Prerequisite met.
- **Session-Init Optimization** — shipped. DEV-RULES.ARC / session-init.md / quality-gate-commands.md
  edits no longer conflict with active audit work. Prerequisite met.
- **ADR-014 (hook-manager detection)** — in place; prerequisite met.
- User Sync UX Polish landing first is preferred — both are pre-1.0 polish; reduces overlap on shared
  adopter-facing surfaces (`arc-config.yml`, DEV-RULES, `arc status`).
- Worktree Foundation landing first is preferred — session-init orientation and worktree-mechanism
  surfaces overlap with surfaces this WU also touches. Clean separation.
- Agile WU Lifecycle landing first — gate-tier mapping per WU tier is a PRD input for this plan; the
  tier model needs to canonicalize before tier-vocabulary rework lands.
- Landing before ARCd Rebrand means rebrand picks up the new tier vocabulary in its bulk rename
  pass, avoiding double-churn (same argument as User Sync UX Polish).

**Scheduling:** After Worktree Foundation and Agile WU Lifecycle. Before ARCd Rebrand. Pre-1.0 polish
window.

**Pre-approved split at PRD-drafting time:** If the chosen tier-vocabulary rework (Path A or B per
§ Alternatives) proves to touch more surface than anticipated, split into:

- WU-A: Hook integration only (new pre-push hook, method dispatch, bootstrap, repo dogfooding).
  Low-churn, architectural.
- WU-B: Tier-vocabulary rework across all surfaces. Editorial, mostly find-and-replace with
  contextual review.

Both halves are independently valuable. Keep unified if the rework stays manageable.

---

[adr-016]: ../../../reference/adr/adr-016-configurable-autonomy-interlocks-for-session-operations.md
