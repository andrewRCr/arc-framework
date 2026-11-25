# Draft: Protected State

- **Origin:** [internal] — minted provisional at `storage-contract`'s draft close (2026-09-30), deferred behind a
  tripwire (C7 and C14 in `draft-storage-contract.md`).
- **Purpose:** An opt-in mode in which the host enforces protection of shared state, refusing rewrites and deletes,
  for teams that need more than tamper evidence.
- **Planning posture:** `P3`, deferred; promote when the tripwire fires. Depends on `storage-cutover`.

---

## Tripwire

A team requires host-enforced protection of shared state.

## Why deferred

The core already carries tamper evidence, and every clone is a backup (C14). No tested host's branch rules reach
`refs/arc/*` — GitHub rulesets refuse the pattern outright (`Invalid target patterns: 'refs/arc/**'`) — and anyone
with write access can rewrite or delete state, confirmed for an ordinary member on GitHub Enterprise Server. The
ancestry check makes a rewind visible, not impossible (C15). Protected state stays opt-in, never the default.

## Options (carried from `storage-contract`, C7)

- **A branch namespace for shared state only** — one or two branches such as `arc-state/shared`, per-person state
  staying in `refs/arc/*` behind tamper evidence. Proven on GitHub: a ruleset on `refs/heads/arc-state/**` accepted
  ARC's fast-forwards and refused rewrites and deletes with `GH013`, though a new branch under the prefix could still
  be created. One ref carries the envelope: about seven state writes a busy hour per person, so about 70 an hour for
  ten people, against pushes of about a second; this depends on the ref layout (C3). ARC can supply `[skip ci]` state
  commits (GitHub Actions, GitLab CI, and Azure Pipelines honor it), a negative fetch refspec
  (`^refs/heads/arc-state/*`) keeping the branches out of ordinary fetches and pickers (a fresh clone still gets them
  once, before ARC's setup runs), and ruleset installation through the host's API. Costs that stay visible: entries
  in the branch list and pull-request base picker, GitHub's recent-pushes banner for every state writer, push
  webhooks, and pull-request-required rules needing an exclusion.
- **Host rules on custom refs** — Azure DevOps's prefix policy blocks ARC's own updates too, and its ref permissions
  for members are untested; a self-managed fast-forward-only pre-receive hook held on GitLab CE.
- **Signed state commits** checked against an allowed-signers file on a protected branch, with clients that never
  follow a rewind and every clone as a backup.
- **The backing repository's own permissions.**

## Open

- Which option, per host, and whether one mode serves every host on the floor.
- How the mode composes with the contract's concurrency mechanisms (C4) when shared state moves off `refs/arc/*`.

## Reading inputs

- `draft-storage-contract.md` — C3, C4, C7, C14, and C15.
- `analysis-storage-substrate-direction.md` § 11 — the host spikes.

---
