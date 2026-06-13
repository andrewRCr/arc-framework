# Draft: Worktree-Default Start

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Origin:** [internal] — the start-time spawn/steering surfaces carved off `async-merge-lifecycle` at
  create-spec (at-cap lateral extraction). The origin owns the async-merge *completion* tail; this member owns
  making worktree-based parallelism the lived default when work *starts*.
- **Purpose:** Make worktree-spawning parallelism the default for new work units, not a manual opt-in. Wire the
  unwired `arc start` create-new (worktree-spawning) mode, flip new-WU dispatch to worktree-by-default under full
  protection, and add the two start-time session-init steering surfaces (`Class`-aware plate-balance awareness and
  cohort-`{name}.md` discovery) so parallelism actually coordinates. The primitives largely ship — this is CLI
  wiring, a default-flip, and small session-init surfaces, not a new subsystem.

---

## Problem / Motivation

ARC has shipped nearly every parallelism *mechanic* (the worktree model, the `spawnWorktree` primitive, location
templating, In-Flight Awareness, the `Class` contract) — yet starting a work unit is still **in-place by default**:
the worktree-*spawning* `arc start` verb is unwired, and new-WU dispatch never defaults to a spawned worktree. The
result is that parallelism remains a manual act rather than the lived default, and the start-time coordination
surfaces that make concurrent streams safe (plate-balance awareness, cohort-doc discovery) are absent.

This member closes that gap on the **start** side of the WU lifecycle — orthogonal to `async-merge-lifecycle`'s
**completion** side (different dep root: this consumes the shipped `spawnWorktree` primitive, not the notes-merge
engine).

---

## Buildables

### `arc start` create-new worktree-spawning wiring

`arc start --here` (cold-start: scaffold into an existing worktree, `createdByArc: false`) shipped with Worktree
Foundation; the worktree-*spawning* create-new mode — plain `arc start <name>` — is still unwired. The
`spawnWorktree` primitive exists (`lib/git/worktree-scaffold.ts`, wrapping `git worktree add -b`) with **no CLI
caller**; the handler currently rejects bare `arc start <name>` (non-`--here`) outright
(`handlers/start.ts`). Net-new is the handler branch that resolves location / base / repo from config and calls
`spawnWorktree`, plus tests — the primitive, location templating (`worktree-location.ts`), and the
full-protection guard all ship.

The `--tier` flag grammar this verb was once paired with is **moot** — `class-model-foundation` retired the
`atomic` / `quick` / `standard` tier model for `Class`, which resolves during planning, not via a CLI flag. Drop
the now-moot tier-flag reference from `start.ts`'s module doc as part of wiring the spawn mode.

### Worktree-by-default steering for new work units

Wiring create-new `arc start` (above) makes worktree-spawning *available*; this makes it the *default*, so
parallelism is the lived default rather than a manual opt-in. The "worktree or not" decision is **mechanical** —
branch-protection mode × worktree-spawn availability — and **identical to the errand relocation `run-errand`
Launch already does**: under full protection spawn an isolated worktree when spawning is available, else cut the
branch in the primary's base checkout; under partial, no branch (direct base commit). It is **not** `Class`- or
depth-keyed (worktree isolation is agent-safety, weight-independent; errands get ephemeral worktrees too).

`init-work-unit` already documents the two modes (in-place / worktree-creating) but leaves them caller-selected
with no default, and its worktree-creating mode delegates to exactly the spawn entry this member wires. Make
worktree-creating the **default under full protection** (spawn available), steered by the `arc-session` /
session-init new-WU dispatch — the WU analogue of `run-errand` Launch. Without this flip, ARC ships every
parallelism mechanic yet `init` keeps creating WUs in-place unless manually steered.

**Scope boundary:** this lands the *default flip* (the mechanical protection × spawn-availability decision). The
end-to-end *verification* of worktree-default across genuinely-concurrent WUs belongs to the downstream
`finalize-parallelism` closeout audit, not this member.

### `Class`-aware plate-balance — the session-init surface

The plate-balance *doctrine* is `concurrent-work-doctrine`'s; this member owns the single advisory annotation line
fed into session-init's next-work discovery so suggestions account for in-flight composition — when a `Heavy` /
`Novel` stream is already open, surface the parallelism caveat (the `Class` model's "roughly one genuinely-novel
stream" balance rule). The `classComposition()` tally utility already exists (`lib/status/class-composition.ts`)
and the in-flight oracle data is already gathered at session-init — net-new is composing one advisory line and
surfacing it conditionally. **Awareness-only, never paternalistic** — it surfaces once and never suppresses,
reorders, gates, or re-nags. Consumes the `Class` contract; does not redefine it.

### Cohort-`{name}.md` discovery at session-init

Agent awareness of the coordinating cohort doc is load-bearing for parallelism actually coordinating. Session-init
does not read or surface `cohort-*.md` today. Owned here as the session-init discovery surface (`AGENT-BRIEF.ARC`
note + optional session-init surfacing); all cohort members rely on the doc being read for their cross-member
coordination to land. Net-new is a conditional doc read in session-init's context-load when the active meta
carries a `Cohort` value, plus a short `AGENT-BRIEF.ARC` note.

---

## Design Decisions carried into the spec

- **Mechanical, not `Class`-keyed.** The worktree-or-not decision keys on branch-protection × spawn-availability
  only — mirroring `run-errand` Launch — never on `Class` or depth. (The conductor's stale "atomic skips / light
  optional / heavy-novel always" framing is wrong on every axis.)
- **The conductor plays no role** — its §5 worktree-orchestration is OBE.

---

## Scope Estimate

**Light — CLI wiring + a default-flip + small session-init surfaces.** The substantive code deliverable is the
`arc start` create-new handler branch (~medium, primitive ready); the default-flip is dispatch logic, and the two
steering surfaces (plate-balance, cohort-doc discovery) are small additive session-init reads against utilities /
data that already exist. `Class: Light` is a best estimate — re-confirm at this member's create-spec read; the
ratchet protects any realized authoring.

### Dependencies

- **Internal (cohort sibling, shipped):** `concurrent-work-doctrine` — the plate-balance balance rule this
  member's advisory surface implements, and the coordination doctrine the cohort-doc discovery serves.
- **Substrate (shipped):** WF's `spawnWorktree` primitive + `worktree-location.ts` templating, the full-protection
  scaffold guard, `arc user close` (the subdir-removal primitive — already wired, dropped from scope), the
  `classComposition()` utility, the `Class` contract, the In-Flight Awareness oracle.
- **No dependency on `async-merge-lifecycle`** — start-side vs. completion-side; the two parallelize.
