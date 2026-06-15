# Notes: lifecycle-transition-core

> _Implementation context and grounding findings carried from task generation. Cross-referenced from task
> descriptions via `_Notes:_ See \`notes-lifecycle-transition-core.md\` § <section>`._

---

## `spawnWorktree` decomposition map

The shipped `spawnWorktree` / `scaffoldIntoWorktree` (`lib/git/worktree-scaffold.ts`) is a coarse primitive that
bundles concerns the mutator bundle separates. It must be **decomposed into the bundle legs**, not delegated to —
delegation breaks graduate (see below). The decomposition is the WU's "relocation primitive unified once" goal,
not added scope.

**What `spawnWorktree` does today** (`git worktree add -b <branch> <base>` → `scaffoldIntoWorktree`):

| Current concern (in `scaffoldIntoWorktree` / `spawnWorktree`) | New home                                                      |
|---------------------------------------------------------------|---------------------------------------------------------------|
| `git worktree add` + ownership marker                         | `reconcile-worktree.spawn` (2.3)                              |
| branch create (the `-b` flag)                                 | rides `reconcile-worktree.spawn` (create only ever co-spawns) |
| **fresh** meta write from template (`renderMetaFile`)         | `scaffold` (create-new) — **not** graduate                    |
| `runUserOpen(...)`                                            | user-workspace side-effect (2.5.b)                            |

**Why delegation fails for graduate.** Graduate (backlog → active) moves the _existing_ backlog meta in via
`relocate-artifacts` (2.1). If `reconcile-worktree.spawn` delegated to `spawnWorktree`, the latter's
template-meta write would **clobber the graduated meta**. Delegation only "works" with a `skipScaffold` flag —
the coupling smell. Hence decompose.

**Recomposition (Phase 5.1).** `arc start` create-new and `arc start --here` cold-start rebuild on the legs:

- create-new = `reconcile-worktree.spawn` + `scaffold` (fresh meta) + user-workspace side-effect.
- cold-start (enters an existing worktree) = `scaffold` + user-workspace side-effect, no `git worktree add`.
- graduate = `relocate-artifacts` + `reconcile-worktree.spawn` (no scaffold — meta moved in).

Existing create-new / cold-start tests pin behavior across the refactor (refactor under green).

## Side-effect implementation split

The location-move side-effects (2.5) are **not** symmetric in what they can build today.

- **`reconcile-status-user`** — build for real. The renderer is shipped (`runStatusUserView` / `composeUserView`
  / `renderStatusTable`, `lib/status/`); the side-effect composes + writes `STATUS.USER`.
- **`reconcile-roadmap`** — **declared** as a `SideEffectId` on every location-move edge (forward-compat:
  `roadmap-tooling` fills the real renderer), but ROADMAP has **no code renderer** today (hand-rendered; the
  format is explicitly unreconciled — a pending `roadmap-tooling` reconciliation owns the § Render standard +
  `render.ts` + the DEV-RULES regen-trigger list). Interim implementation: emit a precise, actionable advisory
  naming the WU + its `from→to` location move ("`<wu>` moved active→parked — ROADMAP hand-render needed"). It does
  real work (no transition silently leaves ROADMAP stale) without committing to format / buckets / the new Parked
  label, which are downstream.

## User-workspace side-effect — use the non-interactive function

The user-workspace open/close side-effect (2.5.b) calls **`runUserOpen` / `runUserClose`**
(`commands/user/open.ts` / `close.ts`) — the non-interactive functions `scaffoldIntoWorktree` already uses
headlessly. **Never** the interactive `handleUserOpen` / `handleUserClose` handlers (`handlers/user.ts`): the
`open` handler fires a clack `p.select` whose default option _deletes_ a prior WU's `SESSION-NOTES` and blocks on
a TTY. That handler-layer hang is owned by `cli-substrate-adoption` (the uniform non-interactive prompting
contract) — not patched here; the lib path is already clean.

## Worktree teardown is not the rollback path

The only existing `git worktree remove` is in `spawnWorktree`'s **rollback** (`--force`). The user-facing
teardown leg (`reconcile-worktree.teardown`, 2.3) must **not** copy that: it refuses a dirty worktree (gate on
`isWorktreeClean`); `--force` stays rollback-only.

## Command surface — top-level verbs, no `lifecycle` namespace

The WU-lifecycle verbs are **top-level** commands, peers of the shipped `arc start`:
`arc park` / `resume` / `promote` / `demote` / `reopen` / `abandon` / `archive` (plus `activate` / `deactivate`).
There is **no `arc lifecycle <verb>` namespace** — `start ⊥ park` is the headline inverse pair and `start` is
already top-level, so the family must share that shape; a generic `lifecycle` noun would also over-claim (errands
have their own lifecycle, under `arc errand`).

- **Slug→state read:** `arc status <slug>` (bare `arc status` = session/active view; with a slug = that WU's
  lifecycle state, JSON shape preserved from the old `arc status --lifecycle`). The spec's earlier
  `arc lifecycle state` is superseded — the namespace it would have joined doesn't exist.
- **Handler files:** the WU-transition verb handlers live in `handlers/lifecycle.ts` (the precise ARC meaning of
  "lifecycle"). The existing installation handlers (`update` / `health` / `diff`) move
  `handlers/lifecycle.ts` → **`handlers/installation.ts`** (+ the one `cli.ts` import) — they are installation
  maintenance, not a WU lifecycle.

## Verb CLI shape & bare invocation

- **Context-defaulting** (slug optional; defaults to the current worktree's WU via `readActiveMetaCandidates`):
  `park` · `reopen` · `archive` · `activate` · `deactivate`. Bare, inside a WU → acts on the current WU; a slug
  targets another.
- **Slug-required** (no current-WU to default to, or destructive): `resume` · `promote` · `demote` · `abandon`
  (`abandon` is slug-required for safety — never default-to-current).
- **Bare invocation** of a slug-required verb (or a context verb run outside a WU): print the **candidate list for
  that verb's valid from-state** (resolver/index-derived — cheap) + the usage line, then exit. **Non-interactive** —
  print + exit, never a clack `select` (the non-TTY hang). E.g. `arc resume` → "Parked: `foo`, `bar` · usage
  `arc resume <slug>`". Mirrors `start`'s `p.log.error`-with-usage precedent, but lists actionable targets.

## Abandon safety gate

`abandon` (all its pre-merge cells) is a destructive cascade — delete branch (local + remote) / worktree /
artifacts / user-workspace / ROADMAP row. Per DEV-RULES.ARC § Cascade-undo it **presents an impact plan and
requires explicit confirmation**. There is **no merged-corner cell**: post-merge backout is a new origin-linked WU
(ADR-026 amendment), never a same-unit `abandon`, and `deactivate` stays the narrow `Active → Planning` undo with no
merge-revert.

Mechanism (non-TTY-safe): the **handler** (judgment layer) prints the cascade/impact plan, then requires an
explicit `--yes` to proceed — bare `arc abandon <slug>` shows the plan and refuses without `--yes` (safe default
under non-TTY = don't destroy). The executor stays pure mechanics; the confirmation reaches it as an `inputs` value.
Matches `cli-substrate-adoption`'s eventual uniform `--yes` / `--no-input` contract.

---
