# Draft: Install Shape Fixtures

- **Origin:** [internal] — minted at the 2026-10-28 housekeep drain from a `USER-INBOX § Work Unit` capture made at
  the harvest of the CineXplorer install rehearsal (2026-10-24).
- **Purpose:** Drive install, the first hooked commit, an Errand and a work-unit start against project shapes this
  repository lacks, so the mechanical install path cannot regress between rehearsal runs.
- **State:** provisional stub. Concern and candidate direction recorded; nothing is settled.

---

## Problem / Motivation

This repository has one stack and one configuration: npm workspaces at the root, TypeScript checks, full protection,
and no hook manager. The CineXplorer install rehearsal (`2026-10-23T083226`) found what that hides:

- two defects only partial protection reaches, though partial protection is every new install's default;
- whole-suite push checks leaving increments untested;
- a root with no `package.json`;
- Python and Docker checks;
- worktrees that need provisioning.

ARC integrates with husky, lefthook, and pre-commit when it detects one, but only unit tests exercise that, and the
end-to-end helper commits with hooks off.

## Candidate Direction

End-to-end fixtures that each build a project shape this repository lacks and run `arc init`, the first commit with
hooks on, an Errand, and a work-unit start against it:

- partial protection;
- a repository with no root `package.json`;
- a non-JavaScript project's checks;
- each supported hook manager.

The agent-driven rehearsal keeps the judgment steps; the fixtures keep the mechanical ones from regressing between
rehearsals.

## Related

- `adopter-install-authority` — a fresh install's inventory, proven against an install.
- `lifecycle-verb-e2e-guards` — CLI-driven tests for destructive lifecycle verbs.
- `RELEASE-GATES` lists this work unit in `gate-a-private-beta` Strong-prefer: Gate A is ARC in use beyond this
  repository, which is where these shapes show up.
