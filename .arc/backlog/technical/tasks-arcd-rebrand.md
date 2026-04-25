# Task List: ARCd Rebrand

- **PRD:** `.arc/backlog/technical/prd-arcd-rebrand.md`
- **Created:** 2026-04-14
- **Branch(es):** `technical/arcd-rebrand` (Phases 1–2, active first),
  `technical/arcd-rebrand-post-rename-cleanup` (Phase 3, created after Phase 2 merge),
  `technical/arcd-rebrand-publish` (Phase 4, created after Phase 3 merge),
  `technical/arcd-rebrand-deprecate` (Phase 5, created after Phase 4 merge),
  `technical/arcd-rebrand-self-migrate` (Phase 6 + Phase 7 + final integration,
  created after Phase 5 merge)
- **Base Branch:** `main`
- **Purpose:** Establish ARCd as the public product/implementation brand while preserving ARC as the
  methodology vocabulary (three-tier model: ARC / ARCd / ARCd Framework) — spans structural renames,
  content sweep, npm publishes, GitHub repo rename, and self-hosted `.arc/` migration.

> **Activation-time reconciliation:** Subtask 2.9.a (line 447) references the framework method as
> `pre-merge-review`. That method was renamed to `diff-review` during Session-Init Optimization
> WU (Task 1.4.a) — update the reference when this WU activates. The extension that shares the
> name (`pre-merge-review` on lines 451-452) keeps its name and needs no change.

---

## Tasks

### **Phase 1:** Code-side structural renames

**Purpose:** Land all mechanical CLI package renames so Phase 2's content sweep operates on final
filenames and identifiers. Atomic commits for each logical change per PRD § Ordering constraint.

**Branch:** `technical/arcd-rebrand` (created from `main` via
[`activate-work-unit.md`][activate-work-unit] before Phase 1 begins).

- [ ] **1.1 Package directory rename (`packages/arc-framework/` → `packages/arcd/`)**

    **Goal:** Move the CLI package to its final location and update the package.json identity. Covers
    PRD R1, R2, R6.

    - [ ] **1.1.a `git mv` package directory**
        - `git mv packages/arc-framework packages/arcd`
        - Verify directory move preserves git history (`git log --follow packages/arcd/package.json`)

    - [ ] **1.1.b Update root `package.json` workspaces**
        - Check workspaces entry — if hardcoded `packages/arc-framework`, update to `packages/arcd`;
          if glob `packages/*`, no change needed
        - Verify `npm install` from repo root resolves the workspace

    - [ ] **1.1.c Update `packages/arcd/package.json`**
        - `name`: `@arc-framework/cli` → `@arcd/cli`
        - `bin`: `{ "arc": "dist/cli.js" }` → `{ "arcd": "dist/cli.js" }`
        - Version stays on current `v0.1.x` line (published-version decision deferred to Task 4.2)
        - Description: retain current (brand sweep happens in Phase 2)

    - [ ] **1.1.d Update tsup / vitest / tsconfig configs**
        - Grep `packages/arc-framework` in `packages/arcd/tsup.config.ts`, `vitest.config.ts`,
          `vitest.e2e.config.ts`, `tsconfig.json`, `tsconfig.test.json`, `eslint.config.js`
        - Update any hits

    - [ ] **1.1.e Verify `lint:sh` shellcheck path glob**
        - `packages/arcd/package.json` → `scripts.lint:sh` references `arc/system/githooks/*` and
          `arc/system/scripts/*` — paths are package-relative, no change needed unless grep finds hits

    - [ ] **1.1.f Tier 1 quality gates on package rename**
        - `npm run build`
        - `npm run typecheck`
        - `npm run test:unit`

- [ ] **1.2 CLI schema code renames**

    **Goal:** Rename config-key and config-value identifiers throughout the CLI source so schema
    operations speak the new vocabulary. Covers PRD R8, R9, R11, R12.

    - [ ] **1.2.a `InstallConfig` interface renames (`src/lib/types.ts`)**
        - `pm_mode: PmMode` → `pm_layer: PmLayer`
        - `team_mode: boolean` → `team_enabled: boolean`
        - Rename type alias `PmMode` → `PmLayer`; literal values
          `"none" | "arc-in-git" | "external"` → `"none" | "arc-pm" | "external"`

    - [ ] **1.2.b `buildConfigMap` / `buildTokenMap` / `buildConfigKeyOverrides` (`src/lib/config.ts`)**
        - Grep `pm_mode`, `pm.mode`, `arc-in-git`, `team_mode`, `team.mode`; update all references
        - Verify key-override logic still functions (check any special-cased keys)

    - [ ] **1.2.c `ARC_IN_GIT_CONDITION` → `ARC_PM_CONDITION` (`src/lib/constants.ts`)**
        - Rename constant; update all import sites across `src/` and `__tests__/`

    - [ ] **1.2.d `init-recipe.json` prompt `config_key` entries**
        - Update `pm.mode` → `pm.layer` and `team.mode` → `team.enabled` in prompt definitions
        - Update any `arc-in-git` literal values to `arc-pm`

    - [ ] **1.2.e Update tests to match renamed identifiers**
        - Grep `__tests__/` for old identifier names; update expected values, type annotations,
          and fixture data
        - Likely hits: `__tests__/unit/config.test.ts`, `__tests__/unit/constants.test.ts`, recipe
          tests, any integration/e2e tests that assert on installed config keys

    - [ ] **1.2.f Tier 1 quality gates on schema code renames**
        - `npm run typecheck`
        - `npm run lint:ts`
        - `npm run test:unit`

- [ ] **1.3 Config file rename — template source**

    **Goal:** Rename the template config file and populate its content with the new schema. Covers
    PRD R7, R27.

    - [ ] **1.3.a `git mv` template config file**
        - `git mv packages/arcd/arc/system/arc-config.yml packages/arcd/arc/system/ARCd-config.yml`

    - [ ] **1.3.b Update template config file content**
        - `pm.mode:` → `pm.layer:`; value `arc-in-git` → `arc-pm`
        - `team.mode:` → `team.enabled:`
        - Add one-line header comment per R27:
          "ARCd installation config — see `arc-methods.md` for behavioral overrides."
        - Leave other defaults unchanged

    - [ ] **1.3.c Update CLI code that hardcodes the config filename**
        - Grep `packages/arcd/src/` for `"arc-config.yml"` string literals; rename to `"ARCd-config.yml"`
        - Likely hits: `src/lib/constants.ts`, `src/lib/paths.ts`, `src/commands/init.ts`,
          `src/commands/reconfigure.ts`, `src/lib/manifest/`
        - Update corresponding tests

    - [ ] **1.3.d Tier 1 quality gates on config file rename**
        - `npm run typecheck`
        - `npm run lint:ts`
        - `npm run test:unit`

- [ ] **1.4 Githooks parse updates**

    **Goal:** Update the shell hook scripts that line-grep config keys. Covers PRD R13.

    **Note:** The installed `.arc/system/arc-config.yml` file stays on its old name and keys until
    Phase 6 (self-migration). Updating hook parsing now creates a temporary inconsistency — hooks grep
    for the new names while the installed config still has the old. Acceptable because the installed
    hooks won't re-run against the installed config until after the Phase 6 atomic migration, which
    resolves the inconsistency in a single commit. Any accidental hook invocation during Phases 2–5
    against the old installed config is tolerated (a lint warning at worst).

    - [ ] **1.4.a Template-source githooks (`packages/arcd/arc/system/githooks/`)**
        - Grep `pm.mode`, `team.mode`, `arc-config.yml` in `pre-commit`, `commit-msg`
        - Update to `pm.layer`, `team.enabled`, `ARCd-config.yml`
        - Methodology-enforcement hook output messages STAY "ARC" per guardrail F — that is a Phase 2
          content decision, not this task

    - [ ] **1.4.b Installed githooks (`.arc/system/githooks/`)**
        - Apply the same script updates to the installed copies (two-copy discipline)
        - The installed config filename itself is NOT renamed here — that is Phase 6

    - [ ] **1.4.c Grep `scripts/` for other shell scripts referencing old names**
        - `scripts/check-package-sync.sh` update is deferred to Task 2.5 (R26)
        - Check `.arc/system/scripts/` and `packages/arcd/arc/system/scripts/` for other offenders

- [ ] **1.5 Explicit `arcd version` subcommand**

    **Goal:** Add an explicit `arcd version` subcommand alongside the existing `--version` flag —
    idiomatic across developer tooling (`git version`, `docker version`, `kubectl version`) and
    improves discoverability. Covers PRD R15.

    **Scope change (2026-04-22):** The former Task 1.5 also covered the `status` → `health` command
    rename (PRD R14 + R16). That rename was transplanted to the Session-Init Optimization WU
    (`tasks-session-init-optimization.md` Task 3.R.k.a) where it lives alongside the session-init probe
    work that motivates it. The global `arc` → `arcd` binary sweep in this WU absorbs the follow-on
    rename (`arc health` → `arcd health`) as part of its normal pass — no dedicated rename subtasks
    remain here. See `prd-arcd-rebrand.md` § CLI command surface cleanup for the reframed R14/R16
    items.

    - [ ] **1.5.a Add explicit `arcd version` subcommand**
        - `src/cli.ts` — add `.command('version').description('Print version').action(...)` that
          prints the same string as `--version`
        - Keep existing `.version()` call (supports `--version` flag)
        - Add a small unit test verifying `arcd version` outputs the expected version string

- [ ] **1.6 Manifest schema version bump**

    **Goal:** Increment the manifest schema version with no migration function (zero-adoption YAGNI
    per PRD § Zero-adoption assumption). Covers PRD R10.

    - [ ] **1.6.a Bump `MANIFEST_SCHEMA_VERSION` in `src/lib/manifest/store.ts`**
        - Increment the version integer
        - Register the new version in the migration map — **no migration function**; entry resolves
          to identity / no-op
        - Existing v0 → v1 migration remains valid (historical)

    - [ ] **1.6.b Update manifest tests**
        - Any tests asserting on schema version — update expected value
        - Verify v0 → v1 migration tests still pass
        - Add a test (if one doesn't exist) verifying the new version registers as a no-op migration

- [ ] **1.7 Tier 2 quality gates — Phase 1 integration checkpoint**

    **Goal:** Verify full Phase 1 is internally coherent before Phase 2 sweep begins.

    - [ ] **1.7.a Full quality gate suite (Tier 2)**
        - `npm run -s lint:md`
        - `npm run lint:ts`
        - `npm run lint:sh`
        - `npm run typecheck`
        - `npm run typecheck:test`
        - `npm test` (full suite including e2e)
        - `npm run build`

    - [ ] **1.7.b Resolve any failures**
        - Issue-triage any unexpected failures; fix inline if minor; escalate if larger
        - No progression to Phase 2 until Tier 2 gates pass clean

### **Phase 2:** Content sweep (three-tier naming unified audit)

**Purpose:** Apply ARC / ARCd / ARCd Framework naming consistently across prose surfaces using
the six guardrails (A–F) from `prd-arcd-rebrand.md` § Content sweep discipline. Forward-looking
`docs.arcd.dev` URLs and `andrewRCr/ARCd-framework` repo refs throughout (R22) — brief broken-link
windows acceptable pre-public. **Branch:** Continues on `technical/arcd-rebrand`.

**Guardrails cheat sheet** (full text in PRD):

- **A.** Common-noun "framework" stays lowercase; brand "ARCd Framework" is capitalized
- **B.** "ARC session" / "ARC workspace" / "ARC project" stay ARC
- **C.** "ARCd installation" (artifact) vs. "ARC install" (methodology adoption) — context-sensitive
- **D.** CLI output chrome → ARCd; methodology-teaching output → ARC
- **E.** AGENT-BRIEFING content drift sweep target (suffix stays, prose updates)
- **F.** Git hook messages: methodology enforcement stays ARC; install / product state is ARCd

**Design decisions:** Per-parent-task commits (review granularity / process-task-loop fit) — not
the PRD's "single coherent commit"; same-branch landing + one `rotate-branch.md` PR preserves intent.
For squashed delivery, use `merge.strategy: squash` on this PR only.

- [ ] **2.1 Sweep `.arc/` installed content**

    **Goal:** Apply the three-tier naming sweep to the installed `.arc/` tree. Covers PRD R20, R21,
    R22 (installed-side).

    - [ ] **2.1.a `.arc/README.md` + agent briefings**
        - `.arc/README.md` — prose sweep
        - `.arc/system/agent/AGENT-BRIEFING.ARC.md` per guardrail E:
          "The ARC Framework implements this methodology..." → "The ARCd Framework implements..."
        - `.arc/system/agent/AGENT-BRIEFING.PROJECT.md` careful read-through for tier-correct prose
        - `.arc/system/agent/CLAUDE.ARC.md` and any other agent files — prose only, `.ARC.md` suffix
          stays (methodology tier marker)

    - [ ] **2.1.b `.arc/reference/constitution/` files**
        - `DEV-RULES.ARC.md`, `DEV-RULES.PROJECT.md`
        - Grep for `arc-framework`, `@arc-framework/cli`, "ARC Framework" (capitalized brand phrase),
          `pm.mode`, `team.mode`, `arc-in-git`
        - Apply guardrails A–F

    - [ ] **2.1.c `.arc/reference/strategies/` files**
        - Specific hot-spots: `strategy-planning-module.md` (multiple `pm.mode` refs),
          `strategy-configurability-architecture.md`, `strategy-file-classification.md`,
          `strategy-team-coordination.md`, `strategy-work-organization.md`
        - Plus any others surfaced by grep

    - [ ] **2.1.d `.arc/reference/templates/`**
        - `template-contributing.md`, any other templates carrying brand references

    - [ ] **2.1.e `.arc/reference/` misc (QUICK-REFERENCE, TECHNICAL-OVERVIEW, PROJECT-STATUS)**
        - `QUICK-REFERENCE.md` — commands and environment context (path references + brand sweep)
        - `TECHNICAL-OVERVIEW.md`, `PROJECT-STATUS.md` — prose sweep

    - [ ] **2.1.f `.arc/system/workflows/` (arc-methods, arc-extensions, workflow files)**
        - `arc-methods.md`, `arc-extensions.md` — prose sweep (methodology vocabulary stays ARC)
        - Individual workflow files under `workflows/arc/` — prose sweep with attention to
          agent-facing output language vs. CLI output chrome
        - Hook message prose per guardrail F

    - [ ] **2.1.g `.arc/backlog/` non-rebrand files**
        - `BACKLOG-TECHNICAL.md`, `BACKLOG-FEATURE.md`, `ROADMAP.md` — prose sweep
        - `plan-wu5-public-release.md`, `plan-arc-modes.md`, `plan-expanded-planning-path.md`,
          `plan-post-release-methodology.md` — prose sweep (preserve the "ARC" references that
          correctly describe methodology-tier concerns in the plans)
        - **Skip** the rebrand WU's own files: `prd-arcd-rebrand.md`, `prd-arcd-docs-site.md`,
          `notes-arcd-rebrand.md`, `tasks-arcd-rebrand.md`, `atomic-arcd-rebrand.md`
        - **Skip** `.arc/reference/archive/**` entirely (historical accuracy per PRD scope)

- [ ] **2.2 Sweep `packages/arcd/arc/` template source (mirror `.arc/` sweep)**

    **Goal:** Two-copy discipline — every content edit in Task 2.1 has a mirror edit in
    `packages/arcd/arc/`. Covers PRD R20 (template side).

    - [ ] **2.2.a Mirror all Task 2.1 edits in `packages/arcd/arc/`**
        - One-to-one correspondence with 2.1.a through 2.1.g subtask targets
        - Note `packages/arcd/arc/backlog/` contains only template `BACKLOG-*.md` stubs and no
          rebrand-specific files, so the "skip rebrand files" exclusion is N/A here
        - Verify framework-file-sync pre-commit hook shows no warnings after staging both copies

- [ ] **2.3 Sweep root-level docs**

    - [ ] **2.3.a `README.md` (repo root)**
        - Full brand sweep using three-tier naming model
        - Hero block authoring happens in Task 2.6 (separate task for the P1 anchor wording)

    - [ ] **2.3.b `CONTRIBUTING.md` (repo root)**
        - Prose sweep — note that `docs/contributing.md` is SKIPPED (under `docs/**`, handled by
          `prd-arcd-docs-site`)

    - [ ] **2.3.c `.github/` directory**
        - Issue templates, PR template, workflow YAML files
        - Grep `.github/` for brand references
        - CI workflow files may embed `arc-framework` path references — update

- [ ] **2.4 Sweep `packages/arcd/README.md` (package-facing)**

    - [ ] **2.4.a CLI-facing README brand sweep**
        - This README appears on the npm package page → full ARCd tier branding
        - Usage examples show `arcd <command>`, not `arc <command>`
        - Installation: `npm install -g @arcd/cli`
        - Link the renamed repo (`andrewRCr/ARCd-framework`) and forward-looking `docs.arcd.dev`

- [ ] **2.5 Update `scripts/check-package-sync.sh` hardcoded path**

    **Goal:** Unblock the framework-file-sync hook after the package directory rename. Covers PRD R26.

    - [ ] **2.5.a Update hardcoded path**
        - `pkg_arc="packages/arc-framework/arc"` → `pkg_arc="packages/arcd/arc"`
        - Verify script still functions against the renamed directory (trial stage-and-commit in
          Task 2.7)

- [ ] **2.6 Author canonical README hero block**

    **Goal:** Produce the P1 anchor wording for the three-tier relationship. Covers PRD R25.

    - [ ] **2.6.a Draft canonical wording**
        - One-or-two-sentence explanation: ARC = methodology, ARCd = implementation, ARCd Framework
          = project-as-a-whole (methodology + implementation together)
        - Place in `README.md` hero section (near top, before or adjacent to the project tagline)
        - This wording becomes the anchor referenced by docs-site landing page and other surfaces
          in the `prd-arcd-docs-site` follow-up — write it to survive as a canonical quotable block

- [ ] **2.7 Verify framework-file-sync hook functions across rename**

    **Goal:** Confirm Task 2.5's path update actually unblocks the hook. Covers PRD R26.

    - [ ] **2.7.a Trial edit + hook invocation**
        - Make a small test edit to a `.arc/` framework file (e.g., an inconsequential whitespace
          fix in a README)
        - Stage it without staging the package-source counterpart
        - Run the pre-commit hook (`git commit` dry — abort before actual commit, OR use a scratch
          commit then revert)
        - Verify the hook correctly resolves `packages/arcd/arc/` and warns about the missing
          counterpart
        - Revert the trial edit

- [ ] **2.8 Sweep verification — grep for stale references**

    **Goal:** Catch anything the per-directory sweep missed.

    - [ ] **2.8.a Full-tree grep for old-brand references**
        - `arc-framework` — classify each hit as acceptable exception or missed target
        - `@arc-framework/cli` — same
        - "ARC Framework" (capitalized brand phrase) — same
        - `pm.mode`, `team.mode`, `arc-in-git` (as config value) — should be zero in active content
        - `arc-framework.github.io` — should be zero (R22 prohibits transitional retention)
        - **Acceptable exceptions:** `packages/arcd/changelog/` historical entries,
          `.arc/reference/archive/**`, the rebrand WU's own files listed in Task 2.1.g skip list,
          document-history rows recording the rename event itself
        - **Missed targets:** fix inline; these are sweep bugs

    - [ ] **2.8.b Tier 3 quality gates (pre-rotation)**
        - `npm run -s lint:md`
        - `npm run lint:ts`
        - `npm run lint:sh`
        - `npm run typecheck`
        - `npm run typecheck:test`
        - `npm test`
        - `npm run build`
        - All must pass before rotation

- [ ] **2.9 Rotate branch — merge `technical/arcd-rebrand` to `main`**

    **Follow [`rotate-branch.md`][rotate-branch] Steps 1–3** (verify, prep, merge). Step 4 (create
    next branch) is deferred to Phase 3 after session boundary ①.

    - [ ] **2.9.a Pre-merge review (method: pre-merge-review)**
        - Run aggregate diff review against `main` — check for scope creep, inconsistencies, dead
          code, documentation drift, and unresolved TODO markers
        - Process findings via review-triage (fix/defer/reject/silent-fix)
        - If `pre-merge-review` extension is configured (CodeRabbit), run it as a second pass per
          `arc-extensions.md` § pre-merge-review

    - [ ] **2.9.b Push branch, create PR, merge to main**
        - `git push -u origin technical/arcd-rebrand`
        - `gh pr create --base main --head technical/arcd-rebrand` — use the rebrand scope summary
          as the PR description
        - Merge: `gh pr merge {pr-number} --merge`

    - [ ] **2.9.c Pull main, delete merged branch**
        - `git switch main && git pull origin main`
        - `git branch -d technical/arcd-rebrand && git push origin --delete technical/arcd-rebrand`

    ⛔ **Session boundary ①: GitHub repository rename.** After Phase 2 merges to `main`, hand off.
    The next session performs the manual GitHub UI rename (`andrewRCr/arc-framework` →
    `andrewRCr/ARCd-framework`) between sessions, then resumes with Phase 3 which completes
    [`rotate-branch.md`][rotate-branch] Step 4 by creating `technical/arcd-rebrand-post-rename-cleanup`
    from the newly-renamed `main`.

### **Phase 3:** (Session boundary ①) Post-rename cleanup

**Purpose:** After the GitHub UI rename completes externally, verify the local clone and repository
contents are consistent with the new name. Covers PRD R17, R18, R19.

**Branch:** `technical/arcd-rebrand-post-rename-cleanup` (created from `main` at phase start —
completes [`rotate-branch.md`][rotate-branch] Step 4–5 interrupted by session boundary ①).

- [ ] **3.1 Verify GitHub UI rename completed**

    - [ ] **3.1.a Confirm renamed repo exists at the new URL**
        - Visit `https://github.com/andrewRCr/ARCd-framework` in a browser — should resolve
        - `https://github.com/andrewRCr/arc-framework` should redirect (GitHub auto-redirects old
          repo URLs for a transitional window; do not rely on this long-term)

- [ ] **3.2 Update local clone for new remote**

    - [ ] **3.2.a `git remote set-url` origin**
        - `git remote set-url origin git@github.com:andrewRCr/ARCd-framework.git` (or HTTPS form
          per local preference)
        - Verify with `git remote -v`
        - Test: `git fetch origin` succeeds against the new URL

    - [ ] **3.2.b Rename local clone directory for consistency**
        - Open a fresh shell at the parent directory (not inside the clone being moved)
        - `mv arc-framework/ ARCd-framework/` (or platform equivalent)
        - Update shell aliases, IDE workspace files, direnv/envrc configs, and any tooling
          pointing at the old path
        - `cd` into the renamed directory; verify `git status` and `git remote -v` work cleanly
        - Note: `install_config.repo_root` in `.arc/system/.internal/manifest.json` now holds the
          stale path. It stays stale through Phases 3–5 without causing test failures (rendered
          `.arc/` content still matches) and gets refreshed to the new path in Task 6.4.

- [ ] **3.3 Create Phase 3 branch**

    Completes [`rotate-branch.md`][rotate-branch] Steps 4–5 interrupted by session boundary ①.

    - [ ] **3.3.a Create branch**
        - `git switch main && git pull origin main`
        - `git switch -c technical/arcd-rebrand-post-rename-cleanup`

    - [ ] **3.3.b Update task list `Branch(es)` field**
        - Add `technical/arcd-rebrand-post-rename-cleanup` to the task list header's `Branch(es)`
          list; stage with other Phase 3 commits

    - [ ] **3.3.c Update status file** (`.arc/active/technical/status-arcd-rebrand.md`)
        - `**Branch:**` field → `technical/arcd-rebrand-post-rename-cleanup`
        - `**Next Task:**` → triple-anchor for Task 3.4 or the next unchecked

- [ ] **3.4 Stale reference sweep post-rename**

    The Phase 2 content sweep applied forward-looking URLs; this task verifies nothing was missed.

    - [ ] **3.4.a Grep for `andrewRCr/arc-framework` in tracked files**
        - Expected: zero hits, except acceptable exceptions (archive, changelog, document-history
          rows recording the rename event)
        - Any unexpected hit → fix inline

    - [ ] **3.4.b Grep for `arc-framework.github.io` in tracked files**
        - Expected: zero hits per R22 (no transitional retention of old Pages URL)

- [ ] **3.5 CI verification on renamed repository**

    - [ ] **3.5.a Trigger CI**
        - Push the first Phase 3 commit to this branch
        - Verify GitHub Actions runs successfully on the renamed repo
        - Check any CI config (workflows under `.github/workflows/`) that references old repo name

    - [ ] **3.5.b GitHub Pages wiring sanity check**
        - Existing mkdocs-based GitHub Pages deploy may still be wired to old repo — note state,
          do NOT tear down (that is `prd-arcd-docs-site` scope)
        - Verify it does not break CI in the transitional state; if broken, capture observation
          in `notes-arcd-rebrand.md` as input for the docs-site follow-up

- [ ] **3.6 Commit post-rename cleanup**

    - [ ] **3.6.a Stage and commit any sweep fixes + task list / status file updates**
        - Commit type: `chore(arc)` for URL updates; `docs(arc)` for prose fixes
        - `Context: tasks-arcd-rebrand.md (Task 3.x)` or range

- [ ] **3.7 Rotate branch — merge `technical/arcd-rebrand-post-rename-cleanup` to `main`**

    **Follow [`rotate-branch.md`][rotate-branch] Steps 1–3.** Step 4 deferred to Phase 4.

    - [ ] **3.7.a Pre-merge review**
    - [ ] **3.7.b Push, PR, merge**
    - [ ] **3.7.c Pull `main`, delete branch**

    ⛔ **Session boundary ② (optional): smoke-test clean main state.** If desired, hand off here
    to validate main is in a consistent state before the first external publish. Otherwise, proceed
    directly to Phase 4.

### **Phase 4:** (Session boundary ②) Publish `@arcd/cli`

**Purpose:** Publish the renamed package as `@arcd/cli` to npm as the first ARCd-branded release.
Covers PRD R1, R3.

**Branch:** `technical/arcd-rebrand-publish` (created from `main` at phase start, completing
[`rotate-branch.md`][rotate-branch] Step 4).

- [ ] **4.1 Create Phase 4 branch**

    - [ ] **4.1.a Branch from `main`**
        - `git switch main && git pull origin main`
        - `git switch -c technical/arcd-rebrand-publish`
        - Update task list `Branch(es)` field and status file
          (`.arc/active/technical/status-arcd-rebrand.md`)

- [ ] **4.2 Publish prep**

    - [ ] **4.2.a Finalize `packages/arcd/package.json` for first `@arcd/cli` publish**
        - **Decide published version** (PRD Open Questions): `0.1.0` (same number, new scope — lean)
          or `0.1.1` (distinct publish event, bumps past the now-deprecated
          `@arc-framework/cli@0.1.1`). Record the decision in commit message
        - Verify `name: @arcd/cli`, `bin: arcd`
        - Description reflects ARCd branding (swept in Phase 2, but verify)
        - `repository.url` and `bugs.url` point to `andrewRCr/ARCd-framework`
        - `homepage` switches to `https://arcd.dev` (docs site, live by this publish) — supersedes
          the pre-rebrand repo-README homepage set on 2026-04-21. npm surfaces homepage as the
          primary user-facing link; docs site is a better first landing than the repo README
        - Verify `author: "Andrew Creekmore"` persists (added 2026-04-21 metadata refresh)
        - Verify `engines.node: ">=24"` persists (bumped from `>=18` on 2026-04-21 to match Node 24
          Active LTS; confirm still current LTS floor at publish time — if Node 24 has entered
          maintenance-only, bump to whatever is then Active LTS)
        - `files` array covers `dist/`, `arc/`, `templates/`, `init-recipe.json`, `changelog/`,
          and `README.md` once the CLI README lands — no stale entries. Current source has
          `dist, arc, templates, init-recipe.json, changelog` (no README yet — tracked as a
          separate ATOMIC-INBOX item)

    - [ ] **4.2.b Smoke-build locally**
        - `npm run build` from repo root
        - Verify `packages/arcd/dist/cli.js` exists with shebang
        - `node packages/arcd/dist/cli.js --version` → prints expected version
        - `node packages/arcd/dist/cli.js version` → prints same string (new subcommand)
        - `node packages/arcd/dist/cli.js health --help` → prints health help
        - `node packages/arcd/dist/cli.js status --help` → command not found (Commander unknown
          command handling — old name gone)

    - [ ] **4.2.c Commit publish prep**
        - Stage `packages/arcd/package.json` and any related changes
        - `Context: tasks-arcd-rebrand.md (Task 4.2)`

- [ ] **4.3 Pre-publish authentication check**

    - [ ] **4.3.a Verify npm auth**
        - `npm whoami` — confirms logged in
        - Verify auth token covers `@arcd` scope (per QUICK-REFERENCE § npm Publishing: granular
          access token in `~/.npmrc`, never `npm login`)
        - If `@arcd` scope is not covered, provision a new token at npmjs.com before proceeding

- [ ] **4.4 Publish `@arcd/cli` to npm**

    **Clean commit boundary required before this step** (Task 4.2.c). Once `npm publish` runs, the
    version is irreversibly live on npm.

    - [ ] **4.4.a Dry-run publish**
        - `cd packages/arcd && npm publish --dry-run`
        - Review output: files included, version, scope, access setting

    - [ ] **4.4.b Actual publish**
        - `cd packages/arcd && npm publish --access public`
        - **External side-effect — irreversible.** `@arcd/cli@<version>` is now live

    - [ ] **4.4.c Verify publish on npm registry**
        - `npm view @arcd/cli` — confirms package exists with expected version
        - Check `https://www.npmjs.com/package/@arcd/cli` page renders correctly

- [ ] **4.5 Smoke-test install from clean environment**

    - [ ] **4.5.a Install in isolated directory**
        - Use a tmp directory outside the repo, or `npx @arcd/cli --version` (one-shot)
        - Run `arcd --version`, `arcd version`, `arcd health --help` — verify all work

    - [ ] **4.5.b Run `arcd init` in a scratch project**
        - Verify init flow completes end-to-end
        - Verify installed `.arc/system/ARCd-config.yml` has correct keys/values
        - Delete the scratch project when done

- [ ] **4.6 Commit publish verification + rotate branch**

    - [ ] **4.6.a Commit any notes file updates**
        - If smoke-test surfaced observations, capture in `notes-arcd-rebrand.md`
        - `Context: tasks-arcd-rebrand.md (Task 4.5)`

    - [ ] **4.6.b Rotate branch — [`rotate-branch.md`][rotate-branch] Steps 1–3**
        - Pre-merge review
        - Push, PR, merge `technical/arcd-rebrand-publish` to `main`
        - Pull `main`, delete branch

    ⛔ **Session boundary ③: deprecation publish.** Hand off recommended. Per PRD, the deprecation
    release is sequenced after `@arcd/cli` is live and has been smoke-tested from a clean install.
    A fresh session ensures clean context for the deprecation flow.

### **Phase 5:** (Session boundary ③) Deprecation release + `npm deprecate`

**Purpose:** Publish `@arc-framework/cli@0.1.1` as a final deprecation-only release pointing at
`@arcd/cli`, then apply the `npm deprecate` wildcard. Covers PRD R4, R5.

**Branch:** `technical/arcd-rebrand-deprecate` (created from `main` at phase start, completing
[`rotate-branch.md`][rotate-branch] Step 4).

**Structural note:** After Phase 1's package rename, `packages/arcd/package.json` is `@arcd/cli`.
Publishing `@arc-framework/cli@0.1.1` requires a separate directory with its own minimal
`package.json` (name `@arc-framework/cli`). This Phase creates that directory **outside the tracked
repo tree** (e.g., `/tmp/arc-framework-cli-deprecation`), publishes from there, and discards it after
the publish + deprecate flag land. The branch itself carries only task list / status file updates —
no code changes to tracked files.

- [ ] **5.1 Create Phase 5 branch**

    - [ ] **5.1.a Branch from `main`**
        - `git switch main && git pull origin main`
        - `git switch -c technical/arcd-rebrand-deprecate`
        - Update task list `Branch(es)` field and status file
          (`.arc/active/technical/status-arcd-rebrand.md`)

- [ ] **5.2 Prepare ephemeral deprecation package**

    - [ ] **5.2.a Create ephemeral directory outside the repo**
        - `mkdir -p /tmp/arc-framework-cli-deprecation`
        - This directory is NOT tracked by git — it exists only to host the deprecation publish

    - [ ] **5.2.b Create minimal `package.json`**
        - `name: "@arc-framework/cli"`
        - `version: "0.1.1"`
        - `description: "DEPRECATED: Renamed to @arcd/cli. See github.com/andrewRCr/ARCd-framework"`
        - `bin: { "arc": "./cli.js" }`
        - `repository.url`, `homepage`, `bugs.url` → `andrewRCr/ARCd-framework`
        - No `dependencies`, no `files` field — minimal

    - [ ] **5.2.c Create deprecation `README.md`**
        - `# @arc-framework/cli (DEPRECATED)` heading
        - Clear pointer: "This package has been renamed. Install `@arcd/cli` instead:
          `npm install -g @arcd/cli`"
        - Link to the renamed repo
        - No historical content — terse pointer only

    - [ ] **5.2.d Create minimal `cli.js` shim**
        - Single-file shim that prints on stderr:
          "@arc-framework/cli has been renamed to @arcd/cli. Please install @arcd/cli instead.
          See github.com/andrewRCr/ARCd-framework"
        - Exit code `1` — scripts that silently rely on `arc` getting installed will fail loudly
          rather than silently no-op

- [ ] **5.3 Pre-publish authentication check**

    - [ ] **5.3.a Verify npm auth covers `@arc-framework` scope**
        - Token must still have publish rights to the old scope
        - If revoked after the rebrand decision, re-provision a new token scoped to `@arc-framework`

- [ ] **5.4 Publish `@arc-framework/cli@0.1.1` deprecation release**

    **Clean commit boundary required** (the Task 5.1.a branch-creation commit suffices).

    - [ ] **5.4.a Dry-run publish**
        - `cd /tmp/arc-framework-cli-deprecation && npm publish --dry-run`
        - Verify version, name, and minimal content

    - [ ] **5.4.b Actual publish**
        - `cd /tmp/arc-framework-cli-deprecation && npm publish`
        - **External side-effect — irreversible.**

    - [ ] **5.4.c Verify on npm registry**
        - `npm view @arc-framework/cli` — confirms `0.1.1` is latest, description shows deprecation

- [ ] **5.5 Apply `npm deprecate` wildcard**

    - [ ] **5.5.a Run wildcard deprecation**
        - Command:
          `npm deprecate "@arc-framework/cli@*" "Package renamed to @arcd/cli — see github.com/andrewRCr/ARCd-framework"`
        - Marks all published versions (including historical `0.1.0`) as deprecated

    - [ ] **5.5.b Verify deprecation flag**
        - `npm view @arc-framework/cli` — `deprecated` field populated on all versions
        - `npm install @arc-framework/cli` in a scratch dir → confirm deprecation warning emits

- [ ] **5.6 Clean up ephemeral deprecation directory**

    - [ ] **5.6.a Delete `/tmp/arc-framework-cli-deprecation`**
        - No longer needed; publish is live and immutable

- [ ] **5.7 Commit deprecation notes + rotate branch**

    - [ ] **5.7.a Commit any notes file updates**
        - Capture the final published version number and timestamps in `notes-arcd-rebrand.md` if
          useful for future reference
        - `Context: tasks-arcd-rebrand.md (Task 5.x)`

    - [ ] **5.7.b Rotate branch — [`rotate-branch.md`][rotate-branch] Steps 1–3**
        - Pre-merge review (branch may be small — just task list and notes updates; rotation still
          applies to keep WU branch sequence coherent)
        - Push, PR, merge `technical/arcd-rebrand-deprecate` to `main`
        - Pull `main`, delete branch

    ⛔ **Session boundary ④: self-hosted migration.** Hand off recommended. Per PRD, the
    self-migration runs last, after every other rename has landed and the package source is fully
    rebranded. A fresh session ensures no context contamination from the publish-focused session.

### **Phase 6:** (Session boundary ④) Self-hosted `.arc/` migration

**Purpose:** Migrate this repository's own `.arc/` directory from pre-rebrand to post-rebrand schema
by hand, bypassing `arc update`'s three-way merge. Covers PRD R23, R24.

**Branch:** `technical/arcd-rebrand-self-migrate` — **this is the final branch.** It carries Phase 6,
Phase 7 verification, and the final [`integrate-work-unit.md`][integrate-work-unit] +
[`archive-work-unit.md`][archive-work-unit] cycle (no further rotation).

- [ ] **6.1 Create final branch**

    - [ ] **6.1.a Branch from `main`**
        - `git switch main && git pull origin main`
        - `git switch -c technical/arcd-rebrand-self-migrate`
        - Update task list `Branch(es)` field (mark this as the final branch)
        - Update status file (`.arc/active/technical/status-arcd-rebrand.md`)

- [ ] **6.2 Rename installed config file**

    - [ ] **6.2.a `git mv` `.arc/system/arc-config.yml` → `.arc/system/ARCd-config.yml`**

    - [ ] **6.2.b Update config content**
        - `pm.mode:` → `pm.layer:`; value `arc-in-git` → `arc-pm`
        - `team.mode:` → `team.enabled:`
        - Apply header comment block per R27 (match the template source in
          `packages/arcd/arc/system/ARCd-config.yml`)
        - **Preserve all existing override values** — `hooks.meta_ref_patterns`,
          `hooks.test_patterns` customizations, and any other non-default settings documented in
          the installed config (check current `.arc/system/arc-config.yml` before renaming)

- [ ] **6.3 Mirror any template-source drift to `.arc/`**

    - [ ] **6.3.a Diff `.arc/` against `packages/arcd/arc/` framework-file set**
        - `diff -r .arc/ packages/arcd/arc/` (scope to framework files per
          `strategy-file-classification.md`)
        - Any framework-file drift from Phases 1–2 that did not land in `.arc/` during those phases
          (pre-commit sync hook should have caught drift, but verify) — apply now
        - If two-copy discipline held throughout Phases 1–5, this should be a no-op

- [ ] **6.4 Regenerate framework-file manifest**

    - [ ] **6.4.a Update `.arc/system/.internal/manifest.json`**
        - Bump stored `schemaVersion` to match Phase 1.6's `MANIFEST_SCHEMA_VERSION`
        - Regenerate file hashes for all framework files in `.arc/`
        - **Update `install_config.repo_root`** to the new directory path (set automatically when
          the `arcd` CLI regenerates; hand-edit if no CLI path). Field was added by WU
          Work-Status Restructure to capture install-time repo path for the framework-sync drift
          check; Task 3.2.b left it pointing at the stale pre-rename path.
        - Prefer using the `arcd` CLI if a refresh-manifest subcommand exists; otherwise hand-edit
          the manifest JSON and recompute hashes via the CLI's hash utility

- [ ] **6.5 Verify migrated install end-to-end**

    - [ ] **6.5.a Run `arcd health`**
        - From repo root — should read `.arc/system/ARCd-config.yml`, report all files as
          `unmodified`, and exit cleanly with no runtime errors

    - [ ] **6.5.b Trial commit to verify hooks**
        - Stage a small doc edit; run `git commit` (abort via empty commit message if running dry)
        - Verify pre-commit hook parses `ARCd-config.yml` successfully
        - Verify commit-msg hook validates format using the new keys

    - [ ] **6.5.c Verify framework-file-sync hook (installed side)**
        - Repeat the Task 2.7 trial-edit pattern against the migrated install

- [ ] **6.6 Commit self-migration as single atomic commit**

    - [ ] **6.6.a Stage all `.arc/` changes**
        - `git add .arc/`
        - Single atomic commit per PRD R23
        - Message: `docs(arc): self-migrate installed .arc/ from rebranded template source`
        - `Context: tasks-arcd-rebrand.md (Task 6.6)`
        - Commit body documents: config filename rename, key/value renames, schema version bump,
          manifest regeneration

### **Phase 7:** Verification

- [ ] **7.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

    Verification runs on `technical/arcd-rebrand-self-migrate`. After verification passes, this
    branch proceeds to [`integrate-work-unit.md`][integrate-work-unit] (PR, review, merge — NOT
    `rotate-branch.md` since this is the final branch), followed by
    [`archive-work-unit.md`][archive-work-unit].

---

## Success Criteria

- [ ] npm: `@arcd/cli` published and installable via `npm install -g @arcd/cli` from a clean machine
- [ ] npm: `@arc-framework/cli@0.1.1` published with deprecation notice in README and package.json
      description
- [ ] npm: `npm deprecate` applied to `@arc-framework/cli@*` wildcard; `npm view @arc-framework/cli`
      shows the `deprecated` field populated across all versions
- [ ] Binary: installed binary is `arcd`; `arcd --version`, `arcd version`, `arcd init`, `arcd join`,
      `arcd update`, `arcd health`, `arcd sync`, `arcd user save|load|push|pull`, `arcd log --atomic`
      all work
- [ ] Binary: old `arc status` command no longer exists (Commander unknown-command handling)
- [ ] Repository: GitHub repo is `andrewRCr/ARCd-framework`; CI passes on renamed repo; local
      `origin` URL points at the new name
- [ ] Repository: zero references to `andrewRCr/arc-framework` in tracked files (grep-verified),
      except documented exceptions (archive, changelog, document-history rename row)
- [ ] Config: installed config file is `ARCd-config.yml` with `pm.layer: arc-pm` and `team.enabled:
      false`
- [ ] Config: manifest schema version bumped; `arcd health` reads the renamed config; git hooks parse
      the renamed keys; no runtime errors surface
- [ ] Content sweep: `docs/**` excepted from all sweep criteria (handled inline by
      `prd-arcd-docs-site`)
- [ ] Content sweep: zero `arc-framework` brand, `@arc-framework/cli`, or "ARC Framework"
      (capitalized brand phrase) references in tracked files, except documented exceptions
- [ ] Content sweep: zero `arc-in-git` config-value references in active content (historical
      changelog excepted)
- [ ] Content sweep: zero `pm.mode` or `team.mode` config-key references in active content
- [ ] Content sweep: "ARCd Framework" appears in prose where project-as-a-whole framing applies
      (README hero, `CONTRIBUTING.md` intro, other project-tier surfaces)
- [ ] Content sweep: three-tier naming model documented in at least one place in the installed
      framework content for future reference
- [ ] Quality gates: `npm run -s lint:md`, `npm run lint:ts`, `npm run lint:sh`, `npm run typecheck`,
      `npm run typecheck:test`, `npm test`, `npm run build` all pass with zero violations
- [ ] Two-copy discipline: `.arc/` and `packages/arcd/arc/` in sync at final commit; no
      framework-file-sync hook warnings
- [ ] Downstream unblock: Operating Modes WU can begin work against the post-rebrand namespace with
      zero residual rename churn
- [ ] All quality gates pass (tests, linting, type checking)
- [ ] Ready for integration and archival

---

[rotate-branch]: ../../system/workflows/arc/work-unit-lifecycle/rotate-branch.md
[activate-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/activate-work-unit.md
[integrate-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[archive-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/archive-work-unit.md
[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
