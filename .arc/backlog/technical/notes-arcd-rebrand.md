# Notes: ARCd Rebrand

**Purpose:** Two-fold.

1. **Reference material.** Execution-useful content extracted from `plan-arcd-rebrand.md` before the plan
   retired — preserves context that didn't fit naturally into `prd-arcd-rebrand.md`'s spec shape but is
   valuable during task generation and execution.
2. **Scratch space.** Durable capture surface for implementation observations, open questions, in-flight
   decision notes, and working context discovered during the rebrand WU's execution that doesn't belong in
   task completion notes or the PRD itself. Use freely during implementation — the notes file is the right
   home for "I noticed X while working on task Y" content that would otherwise bloat task descriptions or
   session notes.

**Intended lifespan:** Until the rebrand work unit is archived.

> **2026-05-03 demotion note:** `tasks-arcd-rebrand.md` and `atomic-arcd-rebrand.md`
> retired; `prd-arcd-rebrand.md` preserved as stale-spec home (see PRD § Status).
> This file's reference content survives the demotion as-is and remains the home for
> any pre-re-graduation working notes.

---

## Secured Namespaces

Claimed during planning (2026-04-07). Factual reference for the npm publish and repo rename tasks.

- `arcd.dev` — domain purchased
- `@arcd` — npm org created
- `arcd-framework` — GitHub org created (display name: ARCd)
- GitHub `arcd` username — blocked by dormant account (created 2016, no visible activity); not pursued
- X/Twitter — `@ARCdFramework` claimed (`@arcd` taken)
- Bluesky — `@arcdframework.bsky.social` claimed (`@arcd` taken)

## Deprecation Sequence (Ordered Walk)

The PRD has the individual requirements (R3, R4, R5); this is the ordering narrative to prevent re-derivation
during task generation.

1. **Publish `@arcd/cli`** as the renamed package. Version per the open question in the PRD (lean: `v0.1.0`
   to match the plan's "stay on the current v0.1.x line" intent). Smoke-test install from a clean machine
   before proceeding.
2. **Publish `@arc-framework/cli@0.1.1`** as a final deprecation-only release. README replaced with a pointer
   at `@arcd/cli` and the renamed repository. `package.json` description carries a deprecation notice. The
   source for this release is whatever commit on the rebrand branch has the deprecation README prepared —
   does not need to be the same code as the first publish.
3. **Apply `npm deprecate` wildcard** once the deprecation release is live:

   ```text
   npm deprecate "@arc-framework/cli@*" "Package renamed to @arcd/cli — see github.com/andrewRCr/ARCd-framework"
   ```

   The wildcard marks every published version (including historical `0.1.0`) as deprecated in the npm
   registry, so any `npm install @arc-framework/cli` at any version emits the deprecation warning.
4. **Leave the deprecated package in place indefinitely.** npm explicitly discourages unpublishing, and the
   pre-public zero-adoption framing makes scrubbing unnecessary. No cleanup task, ever.

## Release Automation Deferred to WU5

This WU publishes `@arcd/cli` and the `@arc-framework/cli@0.1.1` deprecation release **manually** via
session boundaries — no automated release pipeline. The rationale:

- **Zero-adoption framing** (PRD § Zero-adoption assumption). Building a semantic-release / changesets /
  release-please pipeline to support two publishes in this WU is YAGNI. The pipeline's value is in
  sustained release cadence, not one-time rename events.
- **External research precedent.** Idiomatic open-source practice for branch-protected repositories is
  to automate publishes via CI with a bot account holding bypass permissions (semantic-release,
  changesets), OR to use a temporary protection-disable window (pragmatic practice cited in several
  mid-size projects). For a solo-developer pre-public framework with two one-time publishes, building
  CI automation upfront costs more than it saves.
- **Already scoped in WU5.** `plan-wu5-public-release.md` § Release Automation explicitly queues:
  npm trusted publishing (OIDC), release workflow (tag push → build → npm publish → GitHub Release).
  That work unit is the right home for the pipeline.

**Execution model for this WU's publishes:** Each publish runs on its own dedicated branch
(`technical/arcd-rebrand-publish`, `technical/arcd-rebrand-deprecate`) with a clean commit boundary
before the `npm publish` command runs. The publish itself is an external action — the branch merges
to main via standard `rotate-branch.md` after the publish is verified. This preserves `branch.protection:
full` policy consistency without requiring bot accounts or pipeline setup.

The deprecation release of `@arc-framework/cli@0.1.1` runs from an **ephemeral directory outside the
tracked repo tree**, since `packages/arcd/package.json` no longer bears the `@arc-framework/cli` name
after the Phase 1 rename. This is captured in task list Phase 5.

## Self-Hosted Migration Rationale

Why this repository's `.arc/` migration bypasses `arc update`'s three-way merge — context for task generation
to prevent "should we add the migration anyway?" questions.

**Zero adopters exist.** This repository is the only install of the framework anywhere. No other `.arc/`
directory in the world needs to be migrated from the pre-rebrand schema to the post-rebrand schema. The
hypothetical adopter served by a three-way merge migration path does not exist.

**Three-way merge can't handle it cheaply.** The rebrand introduces simultaneous key-and-value renames
(`pm.mode: arc-in-git` → `pm.layer: arc-pm`, plus `team.mode` → `team.enabled`, plus the config filename
change from `arc-config.yml` to `ARCd-config.yml`). Teaching the existing three-way merge machinery to
recognize these as a structured transition, rather than treating them as arbitrary line-level conflicts, is
non-trivial implementation work. It would require a schema migration framework the current codebase doesn't
have.

**The self-migration can be done by hand in one commit.** Since only one install exists, a manual sync from
the rebranded `packages/arcd/arc/` template source is fast, reviewable, and low-risk. Single atomic commit.
No machinery to design, test, or maintain.

**Retroactive addition is possible if needed later.** If real adopters ever land on the pre-rebrand package
version and want to upgrade, a migration can be written retroactively. The manifest schema version is
bumped in this work unit so the pathway exists if needed. Until someone shows up needing it, the feature
is YAGNI.

## Three-Tier Naming: Repo Name Variants Rejected

The PRD non-goals list rejects `ARCdFramework` and `arcd-framework` without the reasoning. Captured here in
case the content sweep hits a tool or reviewer wanting to "normalize" the case.

- **`ARCdFramework` (camelcase)** — rejected. Camelcase blurs the `ARCd` + `framework` boundary into one
  compound word that reads as "ARCDf Ramework" on first parse. Hyphenation is GitHub-conventional and
  preserves the visual product-name boundary.
- **`arcd-framework` (lowercase)** — rejected. Drops the brand capitalization from the URL itself. For a
  domain this matters less (URLs with domains rarely propagate as prose), but for a repo name it matters
  more: repo names propagate to diff stats, cross-repo link text, GitHub page titles, and casual prose
  references where capitalization cues meaning.
- **`ARCd-framework` (chosen)** — keeps brand capitalization without breaking readability. The inner
  `framework` doing real disambiguation work because bare `ARCd` doesn't yet have enough standalone brand
  strength to carry bare-word contexts unaided.

The repo is project-tier per the three-tier model, which is why the `-framework` suffix is present at all.
`arcd.dev` and `@arcd/cli` live in containered contexts (a TLD, a scope prefix) that supply semantic lift;
a bare `ARCd` works there. Repo names live in bare-word contexts (diff stats, cross-repo links), where the
short brand doesn't yet have enough strength on its own — so the project-tier form wins.
