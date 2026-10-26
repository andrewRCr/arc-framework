# Draft: Machine Check Runner

- **Origin:** [internal] — minted at the 2026-10-13 housekeep drain from two `USER-INBOX` captures grouped as one
  concern: "Let a machine run declared checks through a configured runner" (2026-10-11), and "Let `arc check` route
  declared checks through a machine's runner without a per-declaration wrapper" (2026-10-12), which left an Errand
  list when its design outgrew an Errand.
- **Purpose:** Let `arc check` run declared checks through a runner a machine configures, without a wrapper written
  into each check's declaration.
- **Planning posture:** provisional, `P2`; `Class` settles at planning.

---

## Captured concerns

### Let a machine run declared checks through a configured runner

- _Observation:_ this repository routes eight heavy declared checks through `scripts/check-runner.sh`, which hands
  each command to a per-machine executable when one exists; here that runs it on a Linux VM on another machine, so
  the dev machine stays free. The pattern is general (Cargo's per-target `runner` and Bazel's `--run_under` wrap
  execution the same way) and serves more than remote execution: `nice` or a memory-capped `systemd-run` on a loaded
  machine, or a container for an isolated toolchain. ARC has no such seam; the repo-local hook is its prototype.

- _Approach:_ a per-machine runner setting in the per-machine configuration tier `config-storage-architecture` is
  designing; a per-check declaration of whether a check may be routed (one that certifies the index, rewrites files,
  or builds what the checkout runs cannot); and check evidence naming the runner that produced each result, since
  today's evidence, including the runtime-input hash of the local install, assumes local execution. The repo-local
  hook retires once it lands. The executor spawns the runner itself, so routing adds no shell dependency: the hook's
  `bash` prefix leaves routed checks unrunnable from a native Windows shell without Bash on PATH (deferred from PR
  #904's review).

- _Captured during:_ the remote-checks trial and the `check-runner-hook` Errand, 2026-10-11.

### Let `arc check` route declared checks through a machine's runner without a per-declaration wrapper

- _Observation:_ routing to a machine's check runner lives in this repository's check declarations
  (`scripts/check-runner.sh` in `.arc/system/arc-checks.yml`, since PR #904), so a project that wants a runner wraps
  its own declarations, and they carry the hook instead of staying plain commands. Moving the lookup into
  `arc check` does not reach a checkout that has not merged base past the change: in a self-hosting checkout,
  `npx arc` and the declarations both come from its own branch, so a stale branch runs locally either way and starts
  routing at its next base merge.

- _Approach:_ have `arc check` find the machine's runner itself (today at `~/.config/arc-framework/check-runner`)
  for the declared checks that opt in, keeping each declaration's command unchanged and a machine without a runner
  running locally as today, then retire the wrapper. Decisions to record: which checks route (a per-check marker, a
  heavy class, or every check); what an absent or failing runner does (fall back, refuse, or honor a `required`
  mode); and how check-reuse evidence binds to a run made on another machine. Pairs with the runner notice
  `arc check` already shows (PR #908).

- _Files:_ `packages/arc-framework/src/lib/checks/process.ts`, `src/handlers/check/`, `.arc/system/arc-checks.yml`,
  `scripts/check-runner.sh`.

- _Captured during:_ the `check-staged-index` Errand, 2026-10-12 (a `storage-ref-backend` checkpoint ran locally);
  moved from `## Errand` the same day, when its launch found the design outgrows an Errand.

## Coupling

- Where the runner setting lives: `config-storage-architecture` § Approach's tier table holds no per-machine,
  cross-project tool setting today.

---
