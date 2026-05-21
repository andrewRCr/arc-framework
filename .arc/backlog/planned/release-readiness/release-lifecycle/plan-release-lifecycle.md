# Plan: Release Lifecycle — Building Blocks for Release-Model-Agnostic Aggregation

**Purpose:** Landing pad for the gap between ARC's per-WU Release Notes Entry codification
(Work Organization Reform R30–R32) and any codification of release **activity** (cut, aggregate,
tag, announce). Captures the design space and constraints; explicitly defers planning until
downstream WUs surface the felt need.

- **State:** Landing pad — rough capture only. Not a formed plan. Surfaced 2026-05-14 during
  Work Organization Reform Phase 2 execution after Conventional Branch spec verification
  surfaced the gap.
- **Created:** 2026-05-14
- **Origin:** Internal — emerged during WOR's branch-format method work. CB's recommended set
  includes `release/`; ARC's WU model doesn't currently support a release-cycle phase, so
  `release/` was dropped from the default branch type set with the gap captured here for
  later. WOR's per-WU Release Notes Entries already codify the contribution side; the
  aggregation side is what this plan eventually addresses.

---

## Problem / Motivation

ARC models the **contribution side** of release activity via per-WU Release Notes Entries (WOR
R30–R32): every shipped WU carries a categorized release note in its archived meta file. Data
is captured per WU.

ARC does NOT model the **aggregation side**: no codified workflow for cutting a release,
aggregating per-WU entries into a CHANGELOG, tagging versions, or announcing shipped work.
Aggregation tooling is noted-as-deferred in WOR's design notes; the workflow that invokes that
tooling, the lifecycle phase around it, and the relationship to ARC's WU model are all
uncodified.

The gap stays abstract as long as ARC itself (solo-dev framework, no real releases yet) doesn't
need to cut a release. The moment ARC ships its first versioned release — or an adopter project
does — the gap becomes operational.

## Design principle: release-model-agnostic

ARC takes no philosophical position on **release theory** and is unlikely to. Whatever this
plan eventually codifies should preserve ARC's compatibility with the full spectrum of release
models adopters bring:

- Projects using git-flow with formal release branches and stabilization windows
- Projects using trunk-based development with tag-on-main shipping
- Projects using continuous deployment (every main merge potentially a release)
- Projects with no formal release model (solo internal tools, in-development frameworks)

The work should land at "ARC provides release-relevant **building blocks**" rather than "ARC
has a release **lifecycle**." Whatever ARC defaults to should be the lightest-weight shape that
doesn't preclude any of the four patterns above.

## What ARC needs internally (irrespective of release model)

Some methodology-level awareness is unavoidable for the building blocks to compose. These
should be considered the minimum surface:

- **Version markers** — some discoverable boundary that says "this is what was shipped at
  point X." Format (semver / calver / dates / arbitrary tags) is adopter-chosen; *presence* is
  required for aggregation to define a range.
- **Aggregation read-path** — tooling that walks `completed/<dated>/<wu-name>/meta-*.md` and
  composes per-WU Release Notes Entries into a CHANGELOG-shaped artifact. Output format
  adopter-configurable; Keep-a-Changelog is the obvious default candidate (WOR's per-WU
  entries already match its 7-category taxonomy).
- **Optional aggregation fire-points** — when adopters want aggregation to fire at specific
  moments (e.g., at tag creation, at release-branch merge), an extension fire-point
  (`pre-tag` / `post-release` / similar) lets them wire it up without ARC prescribing
  *when* the cut happens.

ARC should stay opinion-free on:

- **Version-naming convention** (semver vs. calver vs. free-form)
- **Release ceremony shape** (release branch vs. tag-on-main vs. nothing)
- **Release cadence** (continuous, scheduled, ad-hoc)
- **Publish / announce / deploy mechanics** — out-of-scope for the methodology layer; that's
  CI/CD territory, not ARC's

## Design space (for eventual planning, not decisions)

Four modal release models in modern practice:

1. **Release branches (git-flow style)** — formal `release/<version>` branches, stabilization
   window, multi-commit on the branch (version bump, CHANGELOG, last-look fixes), tag at
   merge to main. Heavier ceremony. Survives in shops with formal QA windows or multi-version
   LTS support.
2. **Tag-on-main (trunk-based)** — main is release-ready at all times; tag a commit and ship.
   CHANGELOG generation at tag-cut. Most common modern default for solo / small-team.
3. **Continuous deployment** — every merge to main potentially a release; no separate cut
   ceremony; CHANGELOG generation per-merge or per-time-window.
4. **No formal release** — common for in-development frameworks (current ARC) and internal
   tools. Per-WU Release Notes Entries accumulate; no aggregation event has fired yet.

ARC's WU model composes with any of these. This plan should NOT pick one as canonical; it
should describe the building blocks that work across all four.

## Open questions (for eventual discussion)

- **What's ARC's "default" release model in the absence of adopter configuration?**
    - Candidate A: tag-on-main + Keep-a-Changelog generation at tag-cut. Lightest weight;
      composes with all four modal patterns above (adopters override if they need branches /
      different format / no aggregation).
    - Candidate B: no codified release model; ARC ships building blocks and documentation;
      adopters wire their own. Even lighter — matches current state.
- **Does the release workflow itself become a WU (planning → integration → archive) or a
  special ceremony outside the WU lifecycle?**
    - WU shape would re-introduce a `release/` branch prefix (currently dropped from default
      `branch-format`).
    - Ceremony-outside-lifecycle shape implies no branch prefix needed; release is a state
      change on existing artifacts or a cut event triggered by tooling.
- **How does aggregation tooling discover release boundaries?**
    - Options: git-tag walking; manual range-spec in CLI invocation; config-driven
      "release-cut markers" elsewhere; commit-message conventions.
- **What's the file-format relationship between per-WU Release Notes Entries and an
  aggregated CHANGELOG?**
    - Keep-a-Changelog is the obvious target format; ARC's per-WU entries already match its
      category taxonomy (per WOR R30). Aggregation could be roughly: concatenate + reorganize
      by category within a version section.
- **Where does `release/` branch prefix fit (if at all)?**
    - Default `branch-format` method currently drops it; override slot supports adopters who
      need it today.
    - If ARC adopts a release-branch default, `branch-format` default updates downstream.
- **Version-naming convention default — semver / calver / free-form?**
    - Semver is the modal modern default; calver has adopters; free-form leaves adopters
      maximum flexibility but loses the ability for aggregation tooling to sort releases
      automatically.

## Adjacent considerations

- WOR delivers per-WU Release Notes Entries (R30–R32). This plan's aggregation read-path
  consumes that data.
- WOR's `branch-format` method drops `release/` from default. If this plan adopts a
  release-branch default downstream, `branch-format` default updates then.
- CHANGELOG-vs-Release-Notes-Entry composition: per WOR design notes, "Aggregation tooling
  (deferred) reads per-WU entries, not commit history" — this plan formalizes that read-path.
- Conventional Commits and Conventional Branches operate at commit and branch granularity;
  per-WU Release Notes Entries operate at WU granularity; this plan operates at version
  granularity. Three composing layers.

## Sequencing notes

Likely downstream of:

- **Worktree Foundation** — potential interaction with release-branch model under per-worktree
  isolation (if adopters use release branches, each release-branch is a separate worktree).
- **Agile WU Lifecycle** — tier-aware archival may inform tier-aware release ceremonies, if
  ceremonies exist at all.

But this plan doesn't directly block any of those. The wide-compat framing means downstream
WUs don't depend on a particular release-cycle decision having been made; ARC's release model
can remain unspecified through several more WUs without breaking anything.

## Resolution shape (open)

This plan may resolve into:

- **A full WU** — if ARC commits to a codified release model with workflow + aggregation
  tooling. Adopter-overridable, but ARC ships a canonical default.
- **A guidance document only** — if ARC commits to "building blocks + documentation; adopters
  wire their own." No codified workflow; aggregation read-path may exist as a CLI command but
  not as a ceremony.
- **A hybrid** — guidance for common patterns + thin tooling primitives (aggregation
  read-path as a method or CLI command), no codified ceremony.

Resolution depth is itself an open question — captured here so the eventual planning
discussion has a place to land. Wide-compat framing pushes toward the lighter end of this
spectrum.

---

## Notes for future planning sessions

- This file is a landing pad, not a commitment. Don't treat the open questions or candidate
  defaults as decisions.
- The release-lifecycle gap is captured in `notes-work-organization-reform.md` § Release-
  lifecycle model — currently unspecified. That note is the constitutional record of the
  gap's existence; this plan is the design surface for eventually resolving it.
- Wide-compat is the design principle most likely to survive into the eventual PRD; the
  specific defaults (tag-on-main vs. nothing vs. hybrid) are open.
