# Draft: Ghost Mode

- **Origin:** [internal] — minted at `storage-contract`'s draft close (2026-09-30) from its ghost-mode decisions
  (C8 in `draft-storage-contract.md`), as a core storage program follow-on.
- **Purpose:** Let a person run ARC in a repository they do not own or cannot commit ARC files to — someone else's
  project, a policy-constrained work repository, a trial — leaving no trace in the repository or on the surfaces
  people read without ARC.
- **Planning posture:** `P2`, tagged core by `storage-contract`; `Class` settles at planning. Its only edge is
  `storage-cutover`, so it runs in the first post-cutover slot.

---

## Problem / Motivation

ADR-035 moves state off the tracked tree on every backend, which leaves the rest of ARC's footprint: its machinery
and constitutional documents are tracked, harness files and Git hooks are installed into the repository, and ARC
writes its own vocabulary into commit messages, pull requests, review comments, and check text. Ghost mode is a core
requirement (Owner, 2026-09-29) — a configuration of the same machinery, not a redesign. `storage-contract` keeps it
reachable and its siblings build the storage half; this work unit builds the rest.

## Settled inputs (from `storage-contract`)

- **The split.** The contract assigns tracked-versus-stored per family, with standard and ghost profiles. The storage
  half — local-only or a designated state remote, each in a separate Git directory, and an exclude-only ignore variant
  with an untracked `.ignore`, which ripgrep reads whether or not it is tracked — is built by `storage-ref-backend` and
  `storage-projection`. This work unit builds the install profile, the footer policy, harness bootstrap without
  tracked files, and the surface boundary.
- **The profiles** (C2). State families are the same under both; ghost differs only where standard tracks, since ghost
  tracks nothing. Project machinery and the constitutional documents become two project-scope families, projected at
  their familiar paths behind the exclude-only ignore; readers load them by `.arc/` path under both profiles. ARC core
  projects read-only from the installed package (C11). The export knob is pinned to `none` (C10), and no task trailer
  is carried.
- **The install profile** (C8). A fact of the install, not a setting: standard when ARC's configuration is tracked in
  the repository, ghost when it lives in the store behind the per-machine pointer. ARC reads which by looking, so no
  `storage.profile` key can disagree with the repository, and only the contract, the projection, init, and the commit
  policy consult it. It passes `strategy-storage-evolution.md` Principle 9 as one axis with two values: it is not a
  backend's property — ghost runs local-only or with a designated state remote, standard on any backend — and ghost
  pins the settings it touches rather than multiplying combinations.
- **Switching** re-runs init with the other profile; no verb of its own, and state does not move. Ghost to standard is
  the trial becoming adoption: one reviewed change commits ARC's machinery and configuration, the per-machine pointer
  retires, and the export default becomes `specs`. Standard to ghost is one change removing the tracked files.
- **Tracked configuration wins** when a ghost install meets it — the upstream adopts ARC, or the person clones an ARC
  project where they ran ghost. Git treats excluded files as expendable, so the pull replaces the projected files on
  disk. ARC says so, the person's work-unit records stay in the store, and they continue as a contributor or a team
  member; their stored configuration retires after ARC reports where it differs from the upstream's.
- **The init wording** says plainly that under ghost, ARC's settings for the repository are the person's alone and
  the same on every branch. Named cost: configuration that describes the code's tooling — chiefly the quality-gate
  commands — cannot vary by branch, and nothing reviews a change to it. No per-branch override is built unless that
  is hit.
- **The footer policy.** ARC leaves nothing in code commit messages by default. A project may opt in to one trailer
  that renders the task attribution the store already holds, on task commits only; the ghost profile never carries it.
  Every other `Context:` kind leaves code commits: the lifecycle and planning kinds go with state, an Errand's identity
  is a store link, and `standalone` has nothing left to say. The default flips once the store's task capture exists;
  until then footers stay as they are. This work unit owns the trailer's form, `commit.context_footer`'s values and
  default, the commit hook, and `arc log`; the register's footer-grammar row folds into it.
- **The surface boundary**, ARC-wide by default. Anything ARC writes, or has an agent write, to a surface people read
  without ARC — commit messages, pushed branch names, pull-request titles and bodies, review comments, replies, and
  dismissals, check and status text, release notes, and issues — reads as the change or event it describes. It carries
  no ARC vocabulary (work unit, Errand, Candidate, terminus, cohort, Owner acceptance, task IDs, lifecycle actions), no
  reference to an ARC artifact, and no ARC process concern. A project opts in to ARC vocabulary on its own surfaces.
  Subject matter is not a leak: a project names its own domain, so this repository, where ARC is both subject and
  process, needs a self-hosting distinction.
- **Making it true.** This work unit records the boundary as an ADR, since it outlives the storage program, and:
    - inventories every path where ARC's code writes to such a surface and fixes each at the source, with tests over
      what it composes — delivery's pull-request body naming the design by its `draft-*` filename
      (`lib/delivery/materialization.ts`) is one, and the Release Notes Entry, which integration already writes free of
      ARC vocabulary, is the ready input for the pull-request body;
    - rewrites `DEV-RULES.ARC` § Commit and PR surface language as the boundary — today it still admits backticked ARC
      artifact references and routes traceability to the footer;
    - checks agent-composed text where ARC mediates it — the commit hook, and the verbs that post to a host — knowing
      a check over prose catches the common terms, never all of them.
- **Traceability inversion** makes the zero-footprint arm viable: rather than a code commit advertising its task, the
  task record captures the increment commit, and `arc` resolves the link in both directions for anyone with store
  access. The footer validator resolves artifacts through the injected resolver seam and degrades gracefully when
  state is absent.
- **Named cost:** with the user directory excluded rather than gitignored, packaging tools that read only
  `.gitignore` could pack it; a contributor rarely publishes, but the cost stays named.

## Open

- **The footprint inventory** — every trace ARC leaves in a repository or on a host, each with its ghost-mode answer
  or an owner: ARC core and project machinery under `.arc/system/`; the constitutional documents; harness files
  (`CLAUDE.md`, `AGENTS.md`, `.claude/`); the tracked root `.ignore`; the `.gitignore` entry; `Context:` footers, the
  `Arc-Maintenance:` trailer, and the `Review disposition set` body; pull-request titles and bodies; review comments,
  replies, and dismissals; check and status text; editor settings; commit and branch conventions; Git hook
  installation; the state remote.
- **Harness bootstrap without tracked files** — how an agent harness reaches ARC's entry point when `CLAUDE.md`,
  `AGENTS.md`, and `.claude/` cannot be committed.
- **The user-facing name.** "Ghost mode" is the working name, chosen for "no footprint". The nearest established term
  is beads' `bd init --stealth`, with the same use case and mechanism (`.git/info/exclude`, no Git hooks); "stealth"
  was set aside for now because it connotes concealment, which misreads the policy-constrained case. Settle it with
  the init wording.

## Scope boundary (Won't Do)

- The storage half — the backends, the separate Git directory, and the exclude-only ignore variant.
- The `Review disposition set` body on review fix commits: the same principle reaches it once review facts are
  stored, and `review-protocol-alignment` owns it.
- Contributing to a project that uses ARC: that is the contributor role, which reads upstream state and takes the
  upstream's tracked configuration (C7).

## Coordination

- **`framework-core-from-package`** — its read-only package projection is how the ghost profile projects ARC core. It
  lands first, or this work unit builds that projection itself (C11).
- **`config-storage-architecture`** — the per-machine configuration pointer needs its `.local/` tier (C14); record the
  dependency when this work unit plans.
- **`storage-ref-backend`** — the state remote's per-clone designation and the local-only backend (C7).

## Reading inputs

- `draft-storage-contract.md` — C2 (the profiles), C7 (the state remote), C8 (ghost mode), C10 (the export), C11,
  and C14.
- `research-local-mode.md` — `local-mode`'s draft, absorbed by `storage-contract`; ADR-035 governs where they
  disagree.
- `adr-035-keep-operational-state-in-repository-refs.md`.

---
