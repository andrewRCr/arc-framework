# Draft: Adopter Install Authority

- **State:** Provisional — captured for deliberate design before commitment.
- **Origin:** [internal] — corpus review found shipped ARC files absent from the installation recipe with no failing
  check.
- **Purpose:** Replace or guard the hand-maintained adopter install inventory so every shipped file has an explicit,
  mechanically verified installation disposition.

---

## Problem

`init-recipe.json` is the effective authority for what reaches an installed project, but its file inventory is
hand-maintained independently of the package tree. A file can exist in `packages/arc-framework/arc/`, remain
byte-identical to the self-hosting copy, appear in an index, and still reach no project. The generated manifest then
repeats the omission, making the drift self-consistent instead of detectable.

The observed gap included workflow and method files such as `drain-inbox.md`, `setup-release-wrapper.md`, lifecycle
transition workflows, `in-flight-scope-check.md`, `assess-parallel-fit.md`, `branch-format.md`, and
`testing-standards.md`. The exact inventory must be re-derived at implementation time; the recorded count is evidence
of the failure mode, not a durable expected total.

`CANONICAL_SKILLS` is a second hand-maintained list on the same authority seam and should be evaluated with the recipe
rather than allowed to drift through a parallel mechanism.

## Design Direction

Prefer deriving the install set from package contents plus explicit conditional-install rules. If full derivation is
not yet coherent, add a fail-closed coverage check requiring every shipped file to declare one recipe disposition.
The check must distinguish intentionally empty or conditional surfaces from accidental omissions and must prove the
fresh-install result, not merely source-tree parity.

## Scope

- Establish the authoritative source for unconditional, PM-mode, team-mode, and intentionally excluded files.
- Detect package files with no installation disposition and recipe entries with no package source.
- Cover fresh install, update, manifest generation, and self-hosting/package projection boundaries.
- Evaluate whether skill generation belongs to the same derived inventory or needs a separately verified authority.

## Constraints

- `init-recipe.json` remains the current shipping authority until a replacement lands.
- Presence in the package tree alone is not evidence that a file should install unconditionally.
- Project-specific and scaffolded/configurable surfaces must retain their existing ownership and merge semantics.
- Do not solve self-hosting manifest freshness here; this concern is the adopter-facing installation half.
