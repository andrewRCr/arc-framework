# Plan: Per-Developer Configuration Storage Architecture

## Problem / Motivation

Per-developer settings (`arc.identity`, `arc.role`, `arc.commitInterlock`, `arc.pushInterlock`, `arc.syncInterlock`,
`arc.releaseOptedIn`) live in `git config --local`. This was a reasonable default for the narrow bootstrap surface
(`arc.identity`, `arc.role`) and accumulated additional keys as the configuration model grew, most recently via the
6.R Configuration Scope Refactor (current WU) which collapsed four formerly dual-scope keys into per-developer
git-config-only storage and renamed `releaseEnabled` → `releaseOptedIn`.

The substrate has not been re-evaluated since the original bootstrap-shaped choice. Three frictions have accumulated:

- **Cross-machine sync is absent.** `git config --local` is per-clone, per-machine. Setting `arc.commitInterlock`,
  `arc.pushInterlock`, and `arc.releaseOptedIn` on one machine requires re-setup on every other machine. Lived
  experience during current-WU dogfooding: the desktop install (this session, 2026-05-11) required hand-redoing
  the laptop's 6.R.10.b setup work — install commands, interlock flips, opt-in flag. ARC already runs a user-notes
  sync infrastructure for `user/{identity}/`; per-developer preferences are exactly the shape of data that
  infrastructure was built for, but the wiring stops at `SESSION-NOTES.md` and a handful of files.

- **Discoverability and visibility are poor.** Inspecting current settings requires `git config --get-regexp '^arc\.'`
  — no file you can open and read. Adopters and contributors learning ARC have no inspectable surface; the
  configuration model is invisible until they know which command to run. Idiomatic peer tooling (jj, Zed, JetBrains,
  direnv, modern Unix-first CLI tools) overwhelmingly uses inspectable config files; git-config-as-tool-settings is
  rare and trending out of fashion.

- **Idiomatic mismatch.** The four `arc.*` keys beyond identity/role are tool preferences, not git settings.
  External research (this session) confirmed that XDG-style config files or in-repo per-project config files are
  the established patterns; git-config-as-tool-settings appears at git-spice and a few other git-adjacent tools but
  is positioned as a deliberate trade-off ("leverage git's existing hierarchy"), not a recommended pattern.

The configuration model is also conceptually 2D: per-project × per-developer, with a third per-machine sub-axis for
install markers and audit-log state. Established peer tooling typically handles only one axis cleanly (per-user-global
via XDG, or per-project via in-repo). VS Code has an open feature request specifically for per-user-per-workspace
settings — the gap ARC sits in. Forcing one storage substrate (`git config --local`) to cover all three axes produces
exactly the mismatch we're seeing.

## Approach

Three-tier storage model, each tier mapped to its natural scope:

| Tier | Storage | Settings | Sync |
| ---- | ------- | -------- | ---- |
| Per-developer, global (per-user-cross-project) | `~/.arc/config.yml` (XDG-style global) | `identity` | None — per-user-per-machine by definition |
| Per-developer, per-project | `.arc/user/{identity}/config.user.yml` (in-repo, gitignored) | `role`, `commitInterlock`, `pushInterlock`, `syncInterlock`, `releaseOptedIn` | Yes — via existing user-notes sync infrastructure |
| Per-developer, per-project, per-machine | `.arc/user/{identity}/.local/` (gitignored, sync-excluded) | Install markers (`release-setup.json`), audit log, pre-load backups, sync state | Never — per-machine state by intent |

Rationale per tier:

- **Global** — `identity` is per-developer-globally (you're the same person across all your ARC projects).
  XDG-style placement under `~/.arc/` is idiomatic with ecosystem peers (claude, codex, bun, docker, gemini,
  copilot, mozilla, dotnet, etc.). Symmetric with in-repo `.arc/` brand. Bootstrap-friendly: identity resolves
  from this single global file before any in-repo resolution needs to happen.

- **Per-project per-user** — `role` is irreducibly per-project (you can be maintainer here and contributor on
  another project). Interlocks and `releaseOptedIn` are personal workflow preferences scoped to a project's
  rhythm. Riding user-notes sync means these preferences follow you across machines automatically — the
  cross-machine pain point resolves at zero marginal infrastructure cost since ARC already runs the sync layer
  for `SESSION-NOTES.md`.

- **Per-machine** — install markers track which harnesses are set up on *this* machine (per-machine state by
  definition, not user preference). Audit log and pre-load backups are local-only by design (audit-log entries
  reference local commit hashes; pre-load backups are recovery surfaces). Today: stored in `.arc/user/{identity}/.internal/`.
  Rename to `.local/` proposed — see below.

### Identity bootstrap

- **Detection:** `arc init` / `arc join` reads `git config user.email`, takes the first segment before `@`,
  presents as default identity suggestion ("Use `andrew` as your ARC identity? Y/n, or type a different value").
- **Override:** User accepts default or types preferred value at the prompt. Stored verbatim in `~/.arc/config.yml`.
- **Probe behavior:** Session-init probe is non-interactive by contract. If `~/.arc/config.yml` is absent or carries
  no identity field, the probe surfaces "ARC identity not set on this machine — run `arc init` (new project) or
  `arc join` (existing project)" and halts the workflow. No silent derivation at probe time, no interactive prompt.

### Sync semantics for `config.user.yml`

- Rides the existing user-notes sync via `arc user push` / `arc user pull` / `arc user load`.
- Conflict resolution: last-write-wins with backup, matching the existing `SESSION-NOTES.md` and pre-load-backup
  pattern in `.local/`. No new conflict-handling surface needed.
- Manifest/serialization: extend the user-sync manifest to recognize the new well-known filename. Version-compat
  check needed for older clients reading manifests that contain the new file.

### `.internal/` → `.local/` rename (user dir only)

- **User-dir rename:** `.arc/user/{identity}/.internal/` → `.arc/user/{identity}/.local/`. `.local` carries
  established convention ("per-machine, not synced" — `.env.local`, `.local.yml`, XDG's `~/.local/share/`,
  `~/.local/state/`); `.internal/` is idiosyncratic.
- **System dir untouched:** `.arc/system/.internal/` retains its name. Different concern (framework bookkeeping —
  `manifest.json`, `pristine.json` — content-managed by ARC, not per-machine user state). Keeping `.internal/` for
  the system dir and `.local/` for the user dir cleanly maps one name to one concept.
- **Walker hardening:** Add explicit literal name check (`name === ".internal" || name === ".local"`) to the
  user-sync walker in `lib/io-context.ts:readUserDir`. Today the walker excludes dot-directories generically; the
  literal check defends against a future rename to a non-dot prefix silently flipping sync semantics.
- **Strip leading dots from inner files:** `.audit-log.jsonl` → `audit-log.jsonl`, `.pre-load-backup-*.json` →
  `pre-load-backup-*.json`, `.sync-state.json` → `sync-state.json`. `release-setup.json` already lacks the dot;
  this normalizes. Inside an already-hidden directory the leading dot is redundant and adds friction when actually
  inspecting contents via `ls`.

### Companion architecture concerns folded in

- **`arc-config.yml` comment-density model.** ATOMIC-INBOX entry (2026-05-09) flagged the project-level
  `arc-config.yml` has grown to ~250 lines, dominated by inline reference content. The new per-user file faces the
  same UX question; resolving it for both files together with a shared comment-density model is more coherent than
  splitting the decision across WUs.

- **`arc-` prefix audit (potential).** With `~/.arc/config.yml` as the canonical global filename, the symmetric
  shape across the three tiers would be: `~/.arc/config.yml`, `.arc/system/config.yml` (or hoisted to
  `.arc/config.yml`), `.arc/user/{identity}/config.yml`. The `arc-` prefix on `arc-config.yml` becomes redundant
  given the `.arc/` parent directory. Resolution deferred — see § Open Items.

## Companion ADR

This WU drafts a new ADR documenting the three-tier configuration storage model, identity-bootstrap pattern from
`user.email` derivation, sync semantics for per-user state, and the `.local/` vs `.internal/` distinction.
Sequenced **early in the WU (Phase 1)** — design locked before substrate code lands.

Existing ADRs receive informational amendments rather than new ADRs of their own:

- **ADR-017** (release-wrapper trust model) — note that `releaseOptedIn` substrate moved per the new ADR. The trust
  model itself is unchanged; only the storage location for one input changes.
- **ADR-018** (trigger-set interlock authorization) — note that interlock-key substrate moved per the new ADR. The
  authorization model is unchanged.

This pattern mirrors 6.R's ADR-017 amendment shape — scope clarification, not reversal.

## Scope

### In scope

- New ADR (companion to ADR-017, ADR-018) documenting the three-tier model, identity bootstrap, sync semantics,
  and `.local/` vs `.internal/` distinction. Drafted in Phase 1.
- Global config substrate: `~/.arc/config.yml` reader/writer, with `identity` as the initial schema.
- Per-project per-user config substrate: `.arc/user/{identity}/config.user.yml` (or post-rename filename) —
  reader, writer, default values, schema.
- Identity bootstrap: `arc init` / `arc join` prompts for identity with `user.email`-derived default; writes to
  `~/.arc/config.yml`. Probe halts cleanly on identity-absent state with a setup-incomplete surface.
- Resolver substrate move in `lib/config/resolved-settings.ts` and related: the four collapsed keys (`role`,
  three interlocks, `releaseOptedIn`) resolve from `.arc/user/{identity}/config.user.yml` instead of
  `git config --local`. Identity resolves from `~/.arc/config.yml`.
- Consumer updates radiating from the resolver: setup/install handlers, status handlers, probe envelope
  construction, hook script consumers (per the pre-PRD audit — see § Open Items).
- User-sync manifest format: extend to recognize the new well-known filename. Version compatibility check for
  older clients.
- `.arc/user/{identity}/.internal/` → `.arc/user/{identity}/.local/` rename. System `.internal/` untouched.
- Walker hardening: explicit literal name check alongside dot-prefix heuristic in `readUserDir`.
- Strip leading dots from files inside `.local/` (`.audit-log.jsonl` → `audit-log.jsonl`, etc.).
- `arc-config.yml` comment-density review and remediation (companion ATOMIC-INBOX entry folded in). Both project
  and per-user files land with the same comment-density model.
- Manual migration: maintainer migrates their two machines by hand. No `arc migrate config` command.
- Documentation sweep: DEV-RULES.ARC, `strategy-configurability-architecture.md`,
  `strategy-interlock-release-wrappers.md`, `setup-release-wrapper.md`, every reference to `git config arc.*`,
  identity-related setup docs. Mechanical but wide.
- ADR-017 and ADR-018 informational amendments.

### Out of scope

- Automated migration command (`arc migrate config`). Maintainer migrates manually; pre-1.0, no adopters to
  service.
- Coexistence-window resolver (read from both file and git config). Clean cut-over.
- Cross-machine sync conflict UI beyond last-write-wins-with-backup. Matches existing pattern.
- Per-key precedence machinery beyond what's needed for the three tiers. No global override of in-repo per-user
  prefs (per-project per-user is more specific and should win); no in-repo override of global identity.
- ADR replacements for ADR-017 / ADR-018. Informational amendments only.

## Open Items (pre-PRD pass — resolved before PRD generation, not deferred to WU execution)

Three substantive design questions deliberately deferred from initial planning to a focused pre-PRD pass. Each
needs resolution before PRD work begins.

1. **Hook / CLI consumer audit.** Empirical codebase audit cataloging every consumer of `arc.*` git config keys —
   pre-commit hooks, pre-push hooks, CHECK scripts, audit scripts, anything shell-side. Drives whether the substrate
   move is clean (all consumers are Node code paths, hooks read only `arc-config.yml`) or requires bootstrap-tier
   handling (a subset of keys stay in git config to keep hook scripts shell-parseable). Working hypothesis: hooks
   today consume `arc-config.yml` (project, file-based) and don't reach for the per-user keys; per-user surface is
   exclusively Node-consumed. Audit validates.

2. **Comment-density model.** ATOMIC-INBOX entry (2026-05-09) surveys peer tooling config-doc patterns (heavy
   inline like `nginx.conf` / AWS samples vs. minimal-with-reference-docs like `tsconfig.json` / `Cargo.toml` /
   `vite.config.ts`). ~30-minute external research; pick a model; apply consistently to both `arc-config.yml`
   (project) and the new per-user file. Inline-heavy is drift-resistant; reference-docs is compact-and-extensible.
   Decision drives the structure of every new schema entry in this WU.

3. **`arc-` prefix audit / filename naming.** Three connected naming questions:
   - Should `arc-config.yml` rename to `config.yml` (project-level, hoisted from `.arc/system/`)? The `.arc/`
     parent already brands; the `arc-` prefix is redundant.
   - Should the per-user file be `config.user.yml` (symmetric with `arc-config.user.yml`) or `config.yml` (parent
     `user/{identity}/` already implies user scope, no suffix needed)?
   - What's the migration cost of the rename across docs, code, hooks, and adopter-facing surfaces (npm
     `arc-config.yml` references in published docs)? Resolves to: rename throughout, partial rename (per-user
     dropped, project kept), or no rename (verbose-but-explicit).

   Working lean: full rename to `config.yml` for symmetry and cleaner shape. Decision resolves before PRD.

## Sibling Work Units

- Independent of `plan-lib-layer-type-extraction.md`, `plan-sync-handler-decomposition.md`,
  `plan-user-sync-module-split.md` (the architecture-remediation cohort). Parallel candidates once worktree
  infrastructure unlocks parallel WUs per ROADMAP.
- No hard dependency in either direction with the architecture-remediation trio. Could land in any sub-sequence
  once worktree foundation ships.
- Soft connection to **Work Organization Reform**: if WOR's config-key renames overlap with this WU's substrate
  move, sequencing should be considered (do substrate first to avoid double-migrating affected keys). Worth
  examining at pre-PRD or PRD time once WOR's planned key renames are concrete. Current ROADMAP indicates WOR
  touches `pm.mode` → `pm.layer` and possibly others; these are project-level keys in `arc-config.yml`, not
  per-user keys, so the overlap may be limited to the comment-density / file-naming axes.

## Sequencing

Post-`Worktree Foundation`. The parallelism trio is the priority once the current WU integrates; this WU defers
into the architecture-remediation cohort that follows.

Concrete proposed sequence (subject to closer examination at post-current-WU integration):

```text
current WU (release-wrappers-ergonomics) integrates
  → Work Organization Reform (hard pre-worktree dependency)
  → Worktree Foundation (mechanism layer for parallelism)
  → architecture-remediation cohort (parallel candidates):
      • Lib-Layer Type Extraction
      • Sync Handler Decomposition
      • User-Sync Module Split
      • this WU (Per-Developer Configuration Storage Architecture)
```

Argument for slotting earlier (pre-WOR) is weak: behaviorally equivalent for worktree purposes (worktrees share
`.git/config` and would share the in-repo per-user file the same way), and worktree unlock is the higher-leverage
goal. The cross-machine pain this WU resolves is real but acceptable to absorb for the duration of the worktree
trio.

## Scope Estimate

**Medium.** ~1.5-2× the scope of the 6.R Configuration Scope Refactor (current WU sub-phase) — substrate change +
radial consumer updates + docs sweep + ADR + manual migration. Comparable shape but broader:

- Substrate code (resolver, schema, identity bootstrap, file I/O): medium
- Consumer radial updates (handlers, probe, status, audit-log, setup-marker): medium
- ADR drafting + ADR-017 / ADR-018 amendments: small
- Pre-PRD pass (three open items): small-medium
- Docs sweep across rules, strategies, workflows, briefs: large but mechanical
- `.local/` rename + dot-strip + walker hardening: small (atomic-shaped, bundled)
- `arc-config.yml` comment-density work (and potential `arc-` prefix rename if resolved-yes): small-medium
- Tests across all surfaces: medium

Multi-phase WU. Comparable in shape and scale to the User Sync UX Polish WU or the current Release Wrappers
Ergonomics WU.

---
