# Draft: Markdown Formatting Hygiene

**Purpose:** Make this repo's markdown formatting **deterministic and convention-enforced**, eliminating
recurring hand-maintenance friction — starting with **table column alignment** (hand-fixed nearly every
session), plus **emphasis-marker style** (`_italics_` / `**bold**`) and a **no-emoji** policy. The fix-side
(tooling + one-time sweeps + lint rules) lives here; the **enforcement-side wiring (CI gate + pre-commit
auto-fix) is routed to `quality-gate-hooks`** (its commit-gate dispatch + dogfood scope), which this WU feeds.

- **State:** Draft (pre-spec) — captured 2026-06-05 from a deep investigation (originally attempted as an
  errand; promoted to a WU when execution surfaced design-bearing complications, chiefly the source/instance
  scoping below). **Findings are verified empirically** (see § Verified findings) — do not re-derive.

- **Created:** 2026-06-05.

- **Origin:** [internal] — drains the `USER-INBOX § Atomic` capture "Wire `prettier` into the markdown
  toolchain for deterministic table alignment" (`_Created: 2026-06-05_`, fast-laned from `quality-gate-hooks`).
  Re-scoped away from prettier (rejected — see below).

- **Cohort:** [none] — standalone planned member, **adjacent to `quality-gate-hooks`** (the gate/hook
  *mechanism*; this is repo markdown *content hygiene*). See § Relationship to quality-gate-hooks.

- **Priority:** P3 (quality-of-life; high-frequency friction but non-blocking).

---

## Problem / Motivation

Markdown table column alignment is hand-fixed in this repo nearly every session — a high-frequency,
self-imposed friction. GFM doesn't require visual alignment, and `markdownlint`'s `--fix` normalizes pipe
*style* but does **not** pad-align columns. Two adjacent conventions are also unenforced and drifting:
emphasis-marker style (the repo is ~uniform on `_italics_` / `**bold**` but not enforced) and emoji (the
author avoids emoji, but a stray `❌` table exists and silently breaks tooling). The goal: deterministic,
mechanically-enforced markdown formatting so these stop costing per-session attention.

---

## Verified findings (empirical — do not re-derive)

### Tool selection — `markdown-table-formatter` (JS), table-only

- **Chosen:** [`markdown-table-formatter`](https://www.npmjs.com/package/markdown-table-formatter) (npm,
  v1.7.0). A file-I/O + `--check` wrapper around
  [`markdown-table-prettify`](https://github.com/darkriszty/MarkdownTablePrettify-VSCodeExt) (darkriszty) —
  **the same engine behind the well-regarded "Markdown Table Prettify" VS Code extension**, available as a
  portable Node CLI (no editor needed; works under Zed/Warp/CI).
- **Verified table-only:** formatting changes *only* table rows — byte-for-byte preserves nested-list
  indentation (MD007 4-space), emphasis markers, prose wrap, blank lines, code blocks. (Test: 69-file
  one-time run produced 577 insertions / 577 deletions, **zero** non-pipe changed lines.)
- **Verified arg handling:** it **honors an explicit file list and touches only those files** (`… a.md` →
  only `a.md` changes). With **no args** it recursively globs `**/*.md` from CWD and **skips hidden dot-dirs**
  — so its auto mode can never be relied on here (our docs live under `.arc/`, a dot-dir). Always feed an
  explicit file list.
- **CLI:** `-c/--check` (exit 1 if misformatted), `-p/--columnpadding <n>`, `-v`, `-z/--verbose`. No ignore
  option → scope via the file list.

**Why not prettier (rejected):** prettier reformats the *whole file* (no tables-only mode) and (a) rewrites
nested lists to **2-space** indentation — non-configurable — which collides head-on with `MD007 indent:4`
(our convention; a 2-space rewrite is disqualifying), and (b) normalizes `*italic*`→`_italic_` etc.
Measured churn: **187 / 314 active files (60%)** reformatted. Same disqualifiers apply to other whole-document
CommonMark formatters (`mdformat`, `remark-stringify`).

**Rust alternative (noted, not chosen):**
[`@jameslanska/markdown-table-formatter`](https://github.com/jameslanska/markdown-table-formatter) is
Unicode-display-width-aware (handles CJK/emoji widths) but **library-only** (no CLI; needs a wrapper). Not
needed once emoji are banned (below). Keep as the fallback if wide-character tables ever become legitimate.

### Emoji is the one real incompatibility → remove + ban

- A single research file (`…/research/research-active-work-coordination-vocabulary.md`) had a table using
  `❌` (U+274C). `❌` renders **double-width**; `markdown-table-formatter` aligns by **character count**
  (treating it as width-1), so its output is char-aligned but **display-misaligned**.
- `markdownlint`'s **`MD060/table-column-style`** (active here, see below) checks *display* alignment, so it
  rejects the formatted emoji table: *"Table pipe does not align with header for style 'aligned'"* — **14
  errors**, all in that one file. The Rust tool wasn't confirmed to fix it either (its `/tmp` test was a
  config-resolution artifact — see gotcha below).
- **Resolution (verified):** removing `❌` (→ `None`) makes the table pure ASCII → formatter aligns cleanly
  → **MD060 = 0**. The author dislikes emoji and avoids them anyway, so the policy is: **remove existing
  emoji + ban going forward** (rather than adopt a width-aware formatter to accommodate them).
- **Emoji ban — lint feasibility:** no built-in markdownlint rule, but two options: (1) a **custom rule via
  [`markdownlint-rule-search-replace`](https://www.npmjs.com/package/markdownlint-rule-search-replace)** —
  the repo's `.markdownlint-cli2.jsonc` already has `customRules: []` ready; ban emoji codepoint ranges
  (Dingbats/Misc-Symbols incl. U+274C, U+1F300–1FAFF blocks, variation selector U+FE0F) with a clear message,
  enforced in `lint:md`/CI; or (2) a CI/pre-commit grep guard over the same ranges. Pin exact ranges + verify
  it catches `❌` when built.

### `MD060/table-column-style` behavior (markdownlint-cli2 0.21.0, `default: true`)

- **It does NOT universally gate width-alignment.** A clearly width-misaligned (but consistently spaced)
  table passes MD060 at **0 errors** (verified). MD060 enforces per-file *style consistency* (detected from
  the file's tables), not column padding in general. → `lint:md` alone does **not** guarantee aligned tables;
  the formatter provides a guarantee nothing else does.
- **But width-aligning a file flips its detected style to "aligned,"** after which MD060 *does* enforce
  width-alignment **on that file** going forward — a free partial gate per formatted file (and the mechanism
  by which the `❌` table broke once its file was otherwise aligned).

### `markdownlint-cli2` config-resolution gotcha (testing lesson)

- markdownlint-cli2 resolves config **by each file's location in the tree** (walks up; merges discovered
  `.markdownlint-cli2.*`). **Linting a file copied out of the repo (e.g., `/tmp`) with only the root config
  applies a *different* effective config and gives WRONG results.** This bit the investigation 3×
  (false 14-vs-0 MD060 readings; false "0 emphasis violations"). **Always test at the real path inside the
  worktree** (`--no-globs <relpath>` from the worktree cwd, or a full glob run).

### `markdown-table-formatter` cwd-glob operational footgun (caused a leak)

- Because no-args mode globs **CWD**, running the formatter from the wrong working directory swept the wrong
  tree. During the errand attempt it leaked table reformatting into the **primary worktree** (28 non-`.arc/`
  files — `docs/` + `packages/arc-framework/arc/`; `.arc/` was spared because the glob skips dot-dirs).
  Recovered via a scoped `git checkout`. **Lesson for execution:** run from the *target* worktree with an
  **explicit file list**, use `xargs -r` (forbid empty-input runs), and `git status` the primary immediately
  after.

### The killer complication — source/instance scoping (format scope ≠ lint scope)

This is **why this is a WU, not an errand.** In this repo:

- **Framework files are authoritative in `packages/arc-framework/arc/`** and synced *to* `.arc/` (the
  instance). `check-package-sync.sh` (+ `.arc/system/.internal/manifest.json`) enforces the direction:
  editing a framework file in `.arc/` without its package counterpart is flagged ("Framework files are
  authoritative in packages/arc-framework/arc/ — edit the package source and sync").
- **`lint:md` lints the `.arc/` instance** (its globs exclude `packages/arc-framework/arc/**/*.md` except
  `*.template.md`). So the *lint* scope and the *format/edit* scope are **deliberately different**:
    - Framework content → **format the `packages/arc-framework/arc/` source**, then **sync to `.arc/`**.
    - Instance-only `.arc/` files (backlog, active WUs, our `DEV-RULES.PROJECT`, our `QUICK-REFERENCE`, …) →
      format in `.arc/` directly.
    - `docs/`, root `*.md`, other `packages/**` → format directly.
    - Exclude `.arc/completed/**`, top-level `arc/**`, `.arc/**/temp-*.md`, `node_modules` (git-tracked-only
      already excludes the last).
- The errand attempt got this wrong (mirrored `lint:md`'s exclusions → aligned 16 `.arc/` framework instances
  while *excluding* their authoritative sources → divergence + package-sync warning). The **`format:tables`
  script must encode the inverted scope**, and the one-time sweep must run on the source side + sync.
- **Classification from the attempt:** of staged `.arc/` changes, **16 were framework** (have a
  `packages/arc-framework/arc/` counterpart — strategies, briefs, `DEV-RULES.ARC`, workflows, READMEs) and
  **43 were instance-only**.

### Churn measurements (active set ≈ 314 files)

- **Tables:** ~58 files (per `--check` on the plan-branch set) / 69 files (on main) have misaligned tables —
  table-rows-only changes, mechanically safe.
- **Emphasis:** ~**1270** `*italic*` occurrences across **127 files** violate `_italics_` (so the repo is
  *not* uniform — corrected an earlier wrong read caused by the config gotcha). `**bold**` already
  near-uniform (MD050 churn ≈ 0). `markdownlint --fix` auto-converts MD049/MD050. **Same source/instance
  sweep problem applies to this sweep** — another reason to fold emphasis in here.

---

## Scope

### In scope

1. **Adopt `markdown-table-formatter`** as a devDependency (repo dev-tooling, **not** shipped in
   `@arc-framework/cli` — like `markdownlint-cli2`).

2. **A correctly-scoped `format:tables` / `format:tables:check` script** encoding the source/instance rule
   above (format `packages/arc-framework/arc/` source for framework files + instance-only `.arc/` + `docs/` +
   root; exclude completed/shipped-`arc/`/temp). Likely a small wrapper (or `git ls-files` pathspec) since the
   scope is non-trivial. Plus a **sync** step (packages → `.arc/`) so the instance reflects aligned sources.

3. **One-time alignment sweep** over the correct scope; verify `lint:md` green + `check-package-sync` clean.

4. **Emphasis convention** — set `MD049: { style: "underscore" }` + `MD050: { style: "asterisk" }` in
   `.markdownlint-cli2.jsonc`; run the `--fix` sweep (source/instance-aware) over the ~127 files.

5. **Emoji policy** — remove existing emoji (the `❌` table → already verified clean as `None`); add the
   **emoji-ban lint rule** (`markdownlint-rule-search-replace` custom rule, or grep guard).

6. **Discoverability doc (wiring level "a")** — add `npm run format:tables` to the **internal**
   `.arc/reference/QUICK-REFERENCE.md` Tier-1 command reference (next to `lint:md:fix`). *Not* the shipped
   `.template.md` (this is repo dev-tooling). Confirmed: the template doesn't carry repo commands; the
   internal QUICK-REFERENCE is the hand-maintained instance.

### Out of scope

- **Enforcement wiring — CI gate (b) + pre-commit auto-fix (c) — routed to `quality-gate-hooks`** (its
  commit-gate dispatch with auto-fix/auto-restage + this-repo dogfood). This WU produces the fix-commands +
  lint rules; quality-gate-hooks wires them into the gate. See § Relationship.
- **Shipped tool defaults / adopter-facing tool opinions** — `markdown-table-formatter` is repo-internal;
  ARC ships no markdown-formatter choice (consistent with quality-gate-hooks § Out-of-scope "lint tool
  selection opinions").
- **Switching the markdown linter** or reworking existing markdownlint rules beyond MD049/MD050 + the emoji
  rule.

---

## Design decisions & open questions

- **Fold emphasis + emoji-ban into this WU** (vs. the separate errand originally planned): yes — they share
  the source/instance sweep mechanism; solve it once.
- **`format:tables` scope implementation:** inline `git ls-files` pathspec vs. a small wrapper script (e.g.,
  `scripts/format-md-tables.*`). The inverted framework-source scope + the packages→`.arc` sync likely warrant
  a wrapper. Decide at spec.
- **Column padding:** tool default (0) produced standard single-space-padded output that passes MD060; keep
  default unless a reason emerges.
- **Sync mechanism:** identify the authoritative packages→`.arc` sync path (manifest-driven) and whether it's
  a command or manual; the sweep must use it so framework instances aren't hand-edited.
- **Emoji ban ranges:** exact codepoint set + allowlist (fenced code / legitimate symbols?) — pin at spec.
- **Open:** should `format:tables` also cover `packages/arc-framework/arc/**/*.template.md` (linted templates)
  for completeness? Likely yes (they're linted and shippable).

## Relationship to quality-gate-hooks

- **quality-gate-hooks owns the gate/hook *mechanism*** (tier model, pre-commit/pre-push stages, commit-gate
  dispatch with auto-fix + auto-restage, `check-gates`, this-repo dogfood). **This WU owns the markdown
  *content hygiene*** (the formatter, the conventions, the rules, the one-time sweeps).
- **Seam:** the `format:tables` auto-fix command + the emphasis/emoji markdownlint rules this WU produces are
  the exact inputs quality-gate-hooks' commit-gate dispatch (level **b** CI gate + level **c** pre-commit
  auto-fix) consumes. Routed to quality-gate-hooks' Inbound Buffer (this capture adds the entry).
- **Sequencing:** this WU can land independently (fix-commands + rules + one-time-clean state). Hard
  enforcement (b/c) follows in quality-gate-hooks — doing it before the auto-fix hook exists would just
  produce CI failures contributors hand-fix (the friction we're removing).

## Dependencies

- **None blocking.** Composes existing tooling (`markdownlint-cli2`, the package/instance sync). Coordinates
  with `quality-gate-hooks` for enforcement (soft, downstream).

## Scope estimate

**Small–Medium.** The mechanical parts (adopt tool, one-time sweeps, config rules) are quick; the real work
is the **source/instance-aware scope + sync** (the format script + ensuring lint-on-instance stays green after
source→instance sync) and the emphasis sweep over ~127 files. Phaseable: (1) table formatter + correct scope +
sweep; (2) emphasis MD049/MD050 + sweep; (3) emoji removal + ban rule; (4) discoverability doc.
