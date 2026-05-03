# Plan: ARCd Rebrand

**Purpose:** Apply the three-tier ARC / ARCd / ARCd Framework naming architecture across
package surfaces, CLI, config, repo, and prose. Preserve **ARC** as the methodology and
daily-workflow vocabulary; introduce **ARCd** as the implementation / public-product
brand (CLI binary, npm package, domain, docs-site root); use **ARCd Framework** for
project-as-a-whole surfaces (repo name, prose referring to methodology + implementation
together).

- **State:** Plan (intent preserved; needs refresh against current state before
  re-graduating to PRD/tasks)
- **Created:** 2026-04-14 (as PRD); demoted to plan 2026-05-03 (rationale below)
- **Origin:** Originally scoped against pre-public-release product launch. Demoted to
  plan-only form when audience reframed to portfolio-piece-primary and intervening WU
  churn (Session-Init Optimization, agile-WU-lifecycle plan, operational-flow design
  shifts) decayed several PRD specifics that had been frozen in implementation-ready
  form.

---

## ⚠️ Re-graduation requirement

Before this plan re-graduates to PRD + task-list form, refresh scope against current
codebase and methodology state. Several PRD specifics from the prior draft have been
overtaken or partially shipped:

- `arc status` → `arc health` already shipped via Session-Init Optimization. The
  remaining work narrows to absorbing `arc health` → `arcd health` as part of the
  global binary sweep — no dedicated subtask needed.
- `pm.mode: arc-in-git` → `pm.layer: arc-pm` config rename was design-shifted by
  intervening planning work (`plan-agile-wu-lifecycle.md` and adjacent plans). Verify
  the rename still applies in the same shape, or whether the planning-module config
  has evolved since.
- `team.mode` → `team.enabled` rename: verify against current config shape.
- Files-touched indicative lists need re-derivation — the package source's surface
  area has shifted with intervening WUs.
- npm publish-version specifics, schema-version-bump details, and other
  implementation-ready elements should be re-derived at re-graduation, not preserved
  from the prior PRD.

The intent layer below (three-tier model, content-sweep guardrails, ordering
constraint, zero-adoption assumption, session-boundary stops) is durable and survives
the demotion.

---

## Why preserved as plan rather than executed

Project's primary audience reframed during a 2026-05-03 exploratory session:
**portfolio piece for employer evaluation, not product launch for adopter
acquisition**. Adoption is secondary/bonus. Under that reframe, the rebrand's
original drivers weaken substantially:

- Namespace disambiguation and brand differentiation in crowded AI tooling space
  matter for product marketing; matter much less for evaluating engineering work.
- "arc" reads as personal-brand authenticity (initials carryover from `arc-portfolio`)
  rather than as generic naming. A polished product brand on a portfolio piece can
  read as founder-cosplay rather than engineering rigor.

The brand decision itself (ARC / ARCd / ARCd Framework, asymmetric three-tier) is
**preserved, not reopened**. Brand alternatives were explored in the 2026-05-03
session; none surfaced that justified the rebrand cost over the existing direction.
The intellectual-clarity case for the asymmetric tier (cleanly separating methodology
from implementation, avoiding collision with the existing Kotlin "arc framework" in
the AI space) holds independent of marketing motivation. The rebrand still has merit;
it is not pre-1.0 critical.

The session also surfaced a *methodology-positioning phrase* concern that is captured
separately in `plan-docs-content-sweep.md` (item #9). The load-bearing identity work
is public-facing copy, not naming.

---

## Three-tier naming architecture

The split is intentionally asymmetric: it lets daily-workflow surfaces keep their
natural ARC shape while the public-facing brand gets the short, ownable ARCd form for
anything that runs, installs, or represents the project externally.

| Tier               | Vocabulary         | Surfaces                                                                                                                                  |
|--------------------|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| Methodology        | **ARC**            | `.arc/` directory, `arc-*` skills, `.ARC.md` file suffixes, `arc-methods.md`, `arc.*` git config keys, `refs/notes/arc/user/` namespace   |
| Implementation     | **ARCd**           | CLI binary, `@arcd/cli` npm package, `arcd.dev` domain, `ARCd-config.yml`, docs-site branding, README hero, anything that runs / installs |
| Project-as-a-whole | **ARCd Framework** | GitHub repo name, prose referring to methodology + implementation together                                                                |

Skills, methods, and most daily-workflow vocabulary stay ARC. The rebrand applies
primarily to commands, prose/copy, and the config-file rename — broad in surface area
but conceptually contained.

---

## Content-sweep guardrails

The content sweep is the largest single task and the highest risk for inconsistency.
Explicit guardrails for ambiguous cases:

- **Common-noun "framework" vs. brand "ARCd Framework":** "the ARC framework for
  session handoff" (lowercase, common noun, ≈ "scaffolding") is legitimate and
  distinct from "ARCd Framework" (capitalized brand). Heuristic: if substituting
  "scaffolding" or "model" still reads, leave it alone.
- **"ARC session" / "ARC workspace" / "ARC project" stay ARC.** Sessions are
  methodology constructs governed by P5; the agent's session-init / handoff output
  correctly uses ARC. Same reasoning applies to workspace and project framing.
- **"ARCd installation" vs. "ARC install" is context-sensitive.** Use **ARCd
  installation** for deployed-artifact framing ("verify your ARCd installation");
  use **ARC install** for methodology-adoption framing ("adopting ARC in a new
  project"). Both are valid; do not mechanically rewrite one to the other.
- **CLI output chrome is ARCd; methodology-teaching output is ARC.** Startup banners,
  version output, `arcd health` summaries, and CLI success / error messages are
  product chrome → ARCd. Output that teaches methodology conventions (commit-format
  hooks, task-numbering rules, contributor protected paths) → ARC. Heuristic: "Is
  the CLI introducing itself (→ ARCd) or introducing ARC (→ ARC)?"
- **Git hook messages:** methodology enforcement → ARC; install / product state →
  ARCd. Most existing hooks are methodology enforcement; the framework-file-sync
  warning is the notable ARCd-tier case.

---

## Ordering constraint

Structural renames before content sweep. Running the sweep first would require
re-sweeping after structural renames land. Indicative ordering at re-graduation time:

1. Package directory rename (`packages/arc-framework/` → `packages/arcd/`)
2. CLI binary + subcommand surface
3. Config file + schema renames (`arc-config.yml` → `ARCd-config.yml`, key/value
   renames per re-graduation refresh)
4. Unified content sweep (single coherent commit)
5. npm publishes (`@arcd/cli`, then `@arc-framework/cli@0.1.1` deprecation)
6. GitHub repo rename (mandatory session-boundary stop)
7. Self-hosted `.arc/` migration (mandatory session-boundary stop, runs last)

Each is a clean commit boundary. Repo rename and self-hosted migration are
session-boundary stops because in-flight operations cannot cross them without
breaking.

---

## Zero-adoption assumption

The rebrand assumes zero external adoption of `@arc-framework/cli@0.1.0`. Drives
several scope decisions: no managed migration path, no adopter communication, no
upgrade tooling, no scrubbing of deprecated artifacts. Worst case if the assumption
is wrong: that user sees a deprecation warning on `npm install` and follows the
redirect to `@arcd/cli`.

Out-of-scope under this assumption:

- Three-way merge migration for the `pm.layer` rename. The manifest schema version
  bumps without a migration function.
- Adopter changelog, release notes, social announcement.
- Unpublishing deprecated `@arc-framework/cli` versions (npm explicitly discourages
  it; pre-public framing makes scrubbing unnecessary).
- Git notes namespace migration (`refs/notes/arc/user/` stays — methodology tier).
- File-suffix migration (`.ARC.md` stays — methodology tier marker; only internal
  prose sweeps).
- Skill-name migration (`arc-resume`, `arc-commit`, `arc-handoff`, etc. stay —
  methodology workflow triggers; benefit from simplicity over display-brand fidelity).

---

## Session-boundary stops

Operations that cannot cross session boundaries without breaking in-flight work or
confusing review:

1. **GitHub repository rename.** Local clone's `origin` URL becomes stale on rename;
   in-flight fetch / push / PR-creation operations break. Flow: pre-rename code and
   doc work merges to main → manual UI rename → resumed session updates remote URL,
   sweeps stale references, verifies CI.
2. **`@arcd/cli` npm publish.** Irreversible version publish. Separate commit before
   the publish runs.
3. **`@arc-framework/cli@0.1.1` deprecation publish.** Sequenced after `@arcd/cli`
   is live and smoke-tested. Runs from an ephemeral directory outside the tracked
   repo tree (the package source no longer bears the old name post-rename). After
   the deprecation release lands, apply `npm deprecate "@arc-framework/cli@*"` with
   a wildcard pointer at the new package + repo.
4. **Self-hosted `.arc/` migration.** Runs last, after every other rename has landed
   and the package source is fully rebranded. Atomic commit touching only `.arc/`
   plus the updated manifest. Bypasses `arc update`'s three-way merge — teaching
   that machinery the simultaneous key-and-value renames serves no real adopter
   under the zero-adoption assumption.

---

## Two-copy discipline

This repository has two copies of ARC framework content: the authoritative package
source (currently `packages/arc-framework/arc/`; becomes `packages/arcd/arc/`
post-rename) and the installed instance at `.arc/`. The rebrand's content sweep must
update both copies in the same commit wherever a framework file is affected. The
pre-commit framework-file-sync hook protects this throughout — must not be disabled
during the sweep.

---

## Reference material preserved

`notes-arcd-rebrand.md` retains factual reference content across the demotion:
secured namespaces, deprecation publish sequence, repo-name-variant rationale,
self-hosted migration rationale. Survives as durable factual reference for
re-graduation.

---

## References

- `notes-arcd-rebrand.md` — factual reference and execution context
- `plan-docs-content-sweep.md` (item #9) — methodology-identity differentiation
  framing for public-facing copy; complementary positioning work
- `plan-docs-content-sweep.md` (item #5) — agent-native positioning; pairs with #9
