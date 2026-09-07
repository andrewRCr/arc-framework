# Draft: runtime-composition-seams

- **Origin:** [internal] — consolidated from two `USER-INBOX § Work Unit` captures at the 2026-07-26
  housekeep drain.
- **Purpose:** Make command and runtime decision logic independently testable by separating composition from
  production wiring, using the codebase's established injected-dependency seams.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration._

### `[ ]` **Make named seams produce wiring obligations and detect unproducible production states**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-08-20).
- _Concern:_ several blocker-class defects shipped as typed, unit-tested modules or enum/literal arms with no
  production producer. Planning's named-seams table identified the boundaries but emitted only review obligations,
  never executable wiring tasks.
- _Fold-in:_ convert named seam ownership into task obligations and design deterministic analysis for exported
  symbols with no non-test importer, enum members no production path can emit, and hard-coded satisfied literals
  standing where computed facts belong. Coordinate task-generation convention with `planning-iteration-mechanics`.

### `[ ]` **Inject host adapters into the three untested composition modules**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: runtime-composition-seams`), housekeep drain (2026-08-20).
- _Concern:_ `status-composition.ts`, `pre-publication-composition.ts`, and `frontline-run-composition.ts` construct
  their own host ports and receive no test coverage, despite owning real blocked/settled/target decisions.
- _Fold-in:_ accept the ports at the composition seam and cover each decision directly without mocking internals.

### `[ ]` **Refresh the retired runtime seam example**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: runtime-composition-seams`), housekeep drain (2026-08-10).
- _Concern:_ the draft cites deleted `locus/command-runtime.ts` and its process-inspector gate. Remove that example
  and re-inventory the surviving runtime modules against the topology/marker-derived locus reader.

### `[ ]` **Bring `*-runtime.ts` modules to the composition seam their siblings already use**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ several runtime modules mix composition with I/O by importing their collaborators directly, so
  nothing can drive their logic without the real filesystem, git, and process inspector — and they consequently
  carry no unit coverage at all. Two hit in one session: `errand/partial-settle-runtime.ts` had zero coverage at
  any tier, which is why an ordering defect that let a foreign session destroy another's inbox capture stayed
  invisible; `locus/command-runtime.ts` has the same shape, no unit coverage, and is where an unsatisfiable
  resolve gate shipped green. The sibling pattern is already established and demonstrably works —
  `errand/leave.ts` + `leave-runtime.ts` and `errand/close.ts` + `close-runtime.ts` split composition from
  wiring, and their compositions are unit-tested with injected dependencies. This is drift from a convention the
  codebase already holds, not a missing one.

- _Approach:_ inventory `src/lib/**/*-runtime.ts` (and any handler doing the same), classify each as
  already-split, splittable, or genuinely thin wiring, and bring the splittable ones to the sibling shape —
  composition over injected dependencies plus a runtime that supplies the real ones. `partial-settle` was split
  this way during `session-locus-model` and is the worked reference. Coverage is the point, not the shape: each
  split should land the tests the seam makes possible.

- _Approach (codify, so it stops recurring):_ the rule as written is satisfiable while still untestable.
  `testing-standards.md`'s `.override` says "pass `execFile` / `fs` in rather than importing them" — leaf
  primitives — and `partial-settle-runtime.ts` did exactly that (`exec: GitExec` was injected) while importing
  `readLocusState`, `createNodeProvisioningDependencies`, and `acquireSessionAnchor` directly. An author can
  follow the concrete rule to the letter and still produce an untestable module. The `.default`'s "separate
  computation from I/O" is the real principle but stays abstract, and nothing names this codebase's answer to
  it. Add the composition/runtime split to the `.override` as the project's concrete instantiation, naming the
  existing pair as the reference. Project-specific, so `.arc/` — distinct from the universal fixture-fidelity
  clause captured errand-class, which edits `.default` through the package source.

- _Scope:_ `architecture-remediation` reads as the theme home — a browsing-bucket cohort of independent
  structural / code-quality tech-debt units, which this is. Nearest sibling is `sync-handler-decomposition`
  (same theme, different surface — a reference, not a merge target). A prior capture on this theme ("move
  handler/orchestrator unit tests off internal-module mocking toward DI") drained 2026-07-16; check where it
  landed before minting a new stub, in case that home already covers this.

- _Captured during:_ `session-locus-model` Tasks 7.F.b and 7.E.c.iv (2026-07-25) — deliberately kept out of both
  fixes rather than ridden along, since a cross-module audit is not either task's concern.

### `[ ]` **Decide where command-layer resolution logic lives, so covering it needs no export-for-test**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ a reported defect (`W1-F1`) lived in `resolveRekeyCheckout`, a private helper in
  `src/commands/rename.ts` deciding which checkout coordinates the locus rekey receives — real branching, and the
  exact line that was wrong. Nothing could reach it: no test drives `runRenameCommand` (it fetches from origin,
  resolves the lifecycle index, and needs a retirement context), and the integration test for the same concern
  drives the driver directly, one layer below the defect. Covering the fix required exporting the function purely
  for the test. One layer down, the analogous computation (`resolveRenameWorktreeMove` in
  `lib/work-unit/mutators/`) is exported and unit-tested as a matter of course. So decision logic accumulates in
  the command layer with no coverage path, and the workaround is sanctioned by no recorded convention.

- _Approach:_ settle the convention, then apply it. Either resolution helpers carrying real branching move to
  `lib/` — where export plus unit test is already the norm — and commands keep wiring only; or export-for-test is
  explicitly sanctioned with a marker that says so. Inventory `src/commands/**` for private helpers with decision
  logic before choosing; the answer plausibly differs for pure functions versus those taking `exec`.

- _Scope:_ adjacent to **Bring `*-runtime.ts` modules to the composition seam their siblings already use** above —
  same underlying question (logic reachable only through production wiring), different surface (`src/commands/**`
  versus `src/lib/**/*-runtime.ts`). Check at drain whether that stub should absorb this rather than minting a
  second one; if it does, the two want one convention stated once, not two.

- _Captured during:_ `session-locus-model` Task 7.E.d.iii.1 (2026-07-25).

---
