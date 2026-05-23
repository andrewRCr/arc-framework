# Backlog Inbox

> _Project-shared queue of multi-step entries awaiting plan-doc maturation. Live capture in
> `user/{identity}/USER-INBOX.md` § Backlog drains here at WU ceremonies; entries graduate to a per-WU subdir
> under `backlog/{planned,provisional}/<wu-name>/` when scope and plan emerge. See
> `strategy-planning-module.md` § Inbox Family._

## Inbox

### `[ ]` **Pi harness support**

- _Observation:_ Pi is an open-source TypeScript agent harness in the Claude Code / Codex CLI category.
  Categorically orthogonal to ARC (Pi is a runtime agent harness; ARC is a process harness in `.arc/`), so
  coexistence already works via agent-agnostic defaults. Explicit support is ergonomic glue, not architectural
  change.

- _Proposed action:_ `PI.ARC.md` harness file (sibling to `WARP.ARC.md`, distinct from model-identity files
  like `CLAUDE.ARC.md`); skill packaging at Pi's discovery location (`~/.pi/agent/skills/` or `.pi/skills/`)
  with any format adaptation; `arc init --tools pi` / `arc join --tools pi` recognition; verify
  instruction-file discovery (Pi concatenates `AGENTS.md` / `CLAUDE.md` from global+parent+CWD — likely no
  shim, confirm in practice).

- _Out of scope:_ MCP (Pi excludes by design), permission-model guidance (user responsibility).

- _Scope:_ S–M. Pursue when a real Pi user asks or a neighboring WU (rebrand, operating-modes) makes the
  extension cheap.

- _Captured during:_ work-organization-reform (capture drain).

### `[ ]` **Post-integration extension fire-point**

- _Observation:_ ARC's interlock model terminates at the integration-interlock — merge requires explicit human
  approval, but downstream production deployment is out of scope. Teams wanting ARC-style governance over
  deploy approvals (configurable autonomy, structured-prompt approvals, audit-trail consistency) have no
  discoverable hook today.

- _Proposed action:_ A new `post-integration` (or `post-merge`) extension fire-point — opt-in per project,
  declarative `.actions`, no scope creep into deploy-system specifics. Define fire-point semantics (merge
  commit vs. PR-merge event vs. manual post-merge invocation); reference pattern for wiring deploy approvals
  via the structured-prompt model; decide whether a `deploy-interlock` belongs in the autonomy vocabulary
  (likely not — it implies ARC owns the deploy-floor decision; extensions are the loose coupling that keeps ARC
  out of deploy-system specifics).

- _Out of scope:_ Deploy-system specifics, observability contracts, rollback semantics — adopters wire their
  own.

- _Scope-creep risk:_ Data migrations, schema rollouts, feature-flag toggles all want similar hooks. Treat this
  as one of several possible `post-*` points, not a deploy-specific addition.

- _Captured during:_ work-organization-reform (capture drain).

### `[ ]` **Lifecycle-aware link reanchoring for movable ARC artifacts**

- _Observation:_ In `pm.mode: arc-in-git`, lifecycle workflows move PRDs, task lists, atomic companions, plan
  docs, and archives between `backlog/`, `active/`, and `completed/`. Markdown links inside moved files can go
  stale because relative paths anchor to the source file's old directory. The pre-commit link validator catches
  the failure, but recovery is manual and interrupts the activation/archive flow.

- _Proposed action:_ Combined helper + lifecycle CLI improvement — (1) a constrained link-reanchor helper
  accepting explicit move pairs (or reading staged `git mv` state), parsing Markdown links / reference
  definitions and rewriting only targets that resolve to moved ARC artifacts; (2) integrate into future
  lifecycle CLI commands so `npx arc` performs `git mv`, state/PM updates, and link reanchoring as one
  operation. Keep it structural (not broad grep/replace); support `--check`/`--write`; preserve filename-only
  references.

- _Scope:_ M (helper + tests); L if bundled with full activation/archive CLI commands.

- _Captured during:_ work-organization-reform (capture drain).

### `[ ]` **Enhanced link validation — reference-style compliance + hook hardening**

- _Observation:_ Two related gaps surfaced when LSP integration revealed mixed link styles and stale cross-file
  references the existing `validate-links.sh` pre-commit hook didn't catch. (a) DEV-RULES.PROJECT
  § Documentation Standards prefers reference-style for cross-file links, but the codebase is mixed. (b) The
  hook validates only staged files — when a file is moved/renamed (e.g., archival), broken outgoing links from
  un-staged files go undetected (a stale archived-WU reference surfaced long after archival).

- _Proposed action (two lobes; can split):_ (1) **Reference-style compliance sweep** — audit `.arc/` and the
  `packages/arc-framework/arc/` mirror; convert inline `[text](../path/to/file.md)` cross-file links to
  reference-style with an EOF link block (same-directory / one-level-up targets may stay inline). (2) **Hook
  hardening** on `validate-links.sh` — a `npm run lint:links` whole-tree scan wired into Tier 3 + CI; expanded
  candidate set when commits delete/rename `.md` files; optional anchor validation for `file.md#section`;
  optional dup-definition detection.

- _Scope:_ M overall (S for hook hardening; S–M for the sweep, link-volume dependent).

- _Captured during:_ work-organization-reform (capture drain).

### `[ ]` **Standalone binary distribution (non-npm install channels)**

- _Observation:_ The ARC CLI requires Node.js via npm, limiting reach to environments without Node. Not
  release-blocking, but worth addressing as adoption grows beyond JS/TS-primary shops.

- _Research findings:_ Polyglot dev tools that succeed cross-ecosystem (lefthook, mise, just, gh) ship
  standalone binaries; TypeScript CLIs can produce these via `bun compile` or `vercel/pkg`. Distribution by
  reach: GitHub releases + curl install script → Homebrew → system package managers (apt, winget, scoop).

- _Proposed action:_ Investigate `bun compile` for single-file executables; ship via GitHub releases with an
  install script; consider a `.arc-version` pinning convention. Precedent: Claude Code went npm-only first,
  added brew/curl/winget later.

- _Scope:_ M–L (build pipeline + cross-platform testing + install script + docs).

- _Captured during:_ work-organization-reform (capture drain).

### `[ ]` **CLI test-coverage gaps (hardening cluster)**

- _Observation:_ Lower-priority test gaps identified during a CLI work unit's integration review. None are
  blocking; all are edge-case hardening. Some partial coverage exists (`checkLatestVersion`, `render`,
  `io-context`); many cases below show no test (verify each is still a gap before pursuing).

- _Proposed action:_ **Template rendering** — unbalanced `arc:if`/`arc:endif` (stack-underflow recovery),
  deeply nested conditionals, tokens with regex metacharacters. **Filesystem edges** — symlinks in `.arc/`
  (circular, external), `readdir()`/`readFile()` races in status/diff, very large `.arc/` performance.
  **Network errors** — `checkLatestVersion` timeout / invalid JSON / partial response. **Concurrency** —
  parallel `init` + `update`, simultaneous multi-developer sync. **Entry-point wiring** — `writeGitNote` stdin
  failures, `readGitNote` with corrupt refs / missing commits, spinner lifecycle edge cases.

- _Scope:_ S–M total; individual items S. Bundle as one WU rather than ~12 atomics.

- _Captured during:_ work-organization-reform (capture drain).

### `[ ]` **Versioned config-key migration registry for `arc update`**

- _Observation:_ As ARC evolves, config-schema changes (key renames, value-enum shifts) need to migrate adopter
  `arc-config.yml` files during `arc update`. There's no infrastructure for chained or version-gated
  migrations — each rename inlines its own one-shot migrator in `update.ts`. With a single migration on the
  books (the `user-sync-ux` work delivered `user.sync_push` → `user.notes_push` plus
  `session.push_interlock: on-handoff` → `on-sync`), inline is fine; a second concurrent migration starts
  duplicating dispatch + version-gating logic.

- _Proposed action:_ A versioned migrator registry in `update.ts` — each migration
  `{ fromFrameworkVersion, migrate(yaml): yaml }`; `update` runs applicable migrations (selected by stored
  `manifest.framework_version` vs. current) before three-way merging template against migrated yaml. Old
  migrations stay registered indefinitely (idempotent).

- _Notes:_ Deliberately deferred from the user-sync-ux work in favor of the inline one-shot pattern — a pre-1.0
  framework with no shipped adopters can't validate the registry interface against real demand until a second
  migration exists.

- _Trigger:_ A second config-key rename surfaces (likely candidates: interlock/release-wrapper config keys,
  future planning-module keys, the rebrand's surface-wide renames). Scope the WU as "build the registry AND
  register both existing migrations" so two concrete cases inform the interface.

- _Scope:_ S–M (registry + dispatch + version-gating tests + author doc).

- _Captured during:_ work-organization-reform (capture drain).

### `[ ]` **Compatibility testing across agent platforms**

- _Observation:_ ARC claims agent-agnosticism but isn't tested across platforms. ADR-003 assesses
  agent-agnosticism; this would be the validation layer.

- _Proposed action:_ A cross-platform compatibility matrix across the Claude / Codex / Gemini / Warp family
  (and others as the ecosystem evolves) — validate consistent behavior for session-init, handoff, workflow
  execution, and skill invocation across harnesses.

- _Priority:_ Post-1.0.

- _Captured during:_ work-organization-reform (capture drain).

### `[ ]` **Self-hosting manifest / install-state freshness**

- _Observation:_ The self-hosting repo never runs `arc update` against itself (per DEV-RULES.PROJECT
  § Package-Project Sync), so `.arc/system/.internal/manifest.json` (tracked) and `pristine.json` (gitignored)
  drift from package source as shipped content evolves. Consequences: (a) every framework directory move or
  file rename requires error-prone hand-editing of manifest keys + recomputed hashes — confirmed repeatedly
  (a renamed method entry; a dropped legacy PRD entry; defunct keys for directories that no longer exist; cached
  README bodies referencing retired `feature/`/`technical/` subdirs and the old status-file shape); (b)
  `arc health` / `arc diff` against this repo would mis-report many files as "modified," since stored hashes
  no longer match on-disk content. Inert today only because nothing runs those against self, and the
  content-equality sync test validates content (not hashes).

- _Proposed action (candidate directions, not yet chosen):_
    1. A reconciliation command — `arc manifest reconcile` (or `arc update --self`) that recomputes
       `pristine_hash` from current package source and adds / renames / removes entries to match the recipe,
       without touching any user-owned `.arc/` output — so framework moves stop needing manual manifest
       surgery. Document a recurrence cadence (per-release, or post-content-sweep).
    2. Reduce the hash-maintenance surface — make the content-equality check the authority for Framework files
       and derive or de-emphasize stored `pristine_hash`, leaving less mutable manifest state to keep fresh.

- _Notes:_ Distinct from the config-key migration registry (config values, not install-state hashes) and from
  the link-validation entries. The `config-storage-architecture` work explicitly leaves the system `.internal/`
  manifest out of its scope.

- _Scope:_ S–M (command + tests; or a content-authority refactor of the sync check). Design-question
  resolution may take longer than the implementation.

- _Captured during:_ work-organization-reform — consolidates three captures of the same issue (a verification
  manifest-orphan finding, a content-sweep pristine-staleness finding, and a manifest-sweep reconciliation
  finding).

### `[ ]` **Research metadata-shape conventions for WU artifact headers (frontmatter vs. bullet-bold-field)**

- _Observation:_ WU artifact headers (`meta-*`, `tasks-*`, `plan-*`, `prd-*`) use a bullet-bold-field
  convention (`- **Origin:** [internal]` etc.), while system files (workflows, methods, extensions) use YAML
  frontmatter. The mixed convention works but hasn't been deliberately surveyed against industry idiom.

- _Question to research:_ For WU artifact headers, what's the best shape? Three axes — **idiomaticness** (what
  mature docs-as-code / agentic-coding tooling converges on; static-site generators lean YAML frontmatter,
  RFCs/KEPs use mixed patterns), **raw-markdown aesthetics** (bullet-bold-field renders cleanly everywhere;
  YAML frontmatter appears as a fenced metadata block), **parseability** (YAML is parser-friendly + typed;
  bullet-bold-field needs regex + an implicit schema; greppability is comparable).

- _Possible shapes:_ status quo (bullet-bold-field for WU artifacts, YAML for system files); YAML frontmatter
  everywhere; hybrid (YAML structured metadata + bullet-bold-field bodies); or something research surfaces.

- _Why deferred:_ The current convention is locked forward; revisiting requires another cross-template +
  workflow sweep (every metadata consumer). Worth doing only with deliberate research + a clear improvement
  target.

- _Trigger:_ parsing friction during downstream tooling (renderer, programmatic field reads); a decisive
  industry shift toward YAML frontmatter for comparable work-tracking artifacts; or substantively new artifact
  classes warranting fresh metadata-shape thinking.

- _Scope:_ Medium WU. Touches every WU artifact template, every workflow reading metadata fields (session-init
  most critically), CLI parsing in `packages/arc-framework/src/lib/`, and a migration sweep for in-flight
  artifacts. Constitutional impact if the shape changes — companion ADR likely.

- _Captured during:_ work-organization-reform — meta-file field audit + cross-file header-convention
  codification.

### `[ ]` **Italicize file-top narrative-preamble blockquotes (convention + codification)**

- _Observation:_ Top-of-file `>` blockquotes carrying pure prose (file-purpose preamble) read ambiguously in
  raw markdown — they share the blockquote shape with GFM callouts (`> [!IMPORTANT]`), structured field blocks
  (`> - **Workflow:**` / `> - **When:**`), and feature-requirement notes (`> **Requires:** …`). Italicizing
  the narrative variant doubles the "this is meta-commentary, not content" signal — helps human and agent
  skimming, especially in raw-markdown viewers where blockquote styling is minimal.

- _Proposed scope:_ A narrow rule — italicize only the file-top narrative preamble (first blockquote, before
  any `##`, plain prose with no list items / GFM directive / bold-field markers). The other three blockquote
  shapes stay non-italic. Mechanical to check at edit time.

- _Touch points:_ ARC template files (`templates/user/*`, `templates/active/*`, root template-first docs) plus
  selected `.arc/system/`, `.arc/reference/`, and root docs carrying a file-top narrative preamble.
  Package-source-primary with `.arc/` mirror byte-identical. One commit per file family to bound blast radius.

- _Codification (open question):_ Two homes — a paragraph in DEV-RULES.PROJECT § Documentation Standards
  § Markdown quality (project-internal, no new strategy), or implicit by-example via template precedent. Prefer
  the explicit paragraph; "by example" risks drift (no obvious markdownlint rule fits). Quick-tier per the
  atomic-tier infra-edit smell flag (multi-file sweep touching `.arc/system/` + `.arc/reference/`).

- _Captured during:_ work-organization-reform — a user-driven visual-cue preference surfaced the question
  during inbox-preamble migration.

### `[ ]` **ADR Proposed→Accepted timing — flip at integration, not authoring (+ enforcement)**

- _Observation:_ An ADR was marked `Accepted` at authoring time, so a premise corrected later in the same work
  unit had to land as an append-only amendment rather than a clean body edit — under the ADR methodology,
  `Accepted` bodies are immutable. If in-WU ADRs instead held `Proposed` (freely editable) through
  implementation and flipped to `Accepted` at integration, mid-WU corrections would be plain edits and the ADR
  would lock in its final, correct form. The amend-vs-edit tension is really a Proposed→Accepted timing
  question.

- _Proposed scope:_ (1) Codify the timing in `strategy-adr-methodology.md` — in-WU ADRs hold `Proposed` through
  implementation, flip to `Accepted` at integration. (2) Add an explicit "flip any `Proposed` in-WU ADRs →
  `Accepted`" step to `integrate-work-unit.md`. (3) Enforcement to catch an ADR merged while still `Proposed` —
  a pre-merge / CI check or commit-msg-adjacent hook.

- _Scope:_ Quick-tier — touches a strategy, a workflow, and likely a hook/CI check.

- _Captured during:_ work-organization-reform — the integration-time ADR amendment raised amend-vs-edit; the
  root cause is Proposed→Accepted timing.

### `[ ]` **Archival ceremony tooling doesn't accommodate the post-sweep state**

- _Observation:_ The archive commit and final push are the moment a WU leaves `active/`, but the release
  tooling validates against `active/` and so can't serve that commit. Hit live during an integration:
  (1) `arc release commit` and `arc release push` both refused `no-active-wu` at the archive/push step (the
  sweep had already emptied `active/`), forcing raw `git`; (2) the `commit-msg` hook warned the `Context:`
  footer file wasn't in `.arc/active/` (correct — it had just been swept to `completed/`); (3)
  `archive-work-unit.md` says "State flip is the only transition archive owns," yet `template-meta.md` mandates
  a PR URL + Completed post-integration block (and stale forward-fields like `Next Action` want clearing) —
  neither workflow steps through it, so it was done by hand.

- _Proposed scope:_ Decide the sanctioned archival-commit path — either (a) the release wrappers resolve the WU
  from the staged `active/→completed/` rename (or a `--archival` mode) so the wrapper still validates + audits
  the archive commit/push, or (b) `archive-work-unit.md` explicitly specifies raw `git` for its commit/push
  with rationale. Make the `commit-msg` footer check `completed/`-aware for `(archival)` footers (the concrete
  hook fix is the subdir-loop migration entry in ATOMIC-INBOX). Add an explicit "append PR URL + Completed,
  reconcile forward-fields" step to the archive/integrate workflow per `template-meta.md`.

- _Scope:_ Quick-tier — touches a workflow, a hook, and likely the release-wrapper CLI.

- _Captured during:_ work-organization-reform — hit all three facets live while archiving.
