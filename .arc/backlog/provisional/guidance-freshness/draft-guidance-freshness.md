# Draft: guidance-freshness

**Purpose:** Make newer applicable guidance discoverable in a long-lived checkout while preserving explicit version
authority and project overrides.

- **Origin:** [internal] — inbox routing, 2026-10-19; original capture provenance is retained below.
- **Planning posture:** provisional; `P2`; `Heavy`. This capture draft carries unresolved design input; no approved
  design is implied.

---

## Concerns

### Surface newer applicable ARC guidance in long-lived worktrees

- _Observation:_ PR #1027 was composed from an older checkout's integration workflow, which still loads
  `template-pull-request.md` and requires Design and Local review metadata. Current main already ships
  `pull-request-format.md` and wires it into integration, delivery, and Errand workflows. The long-lived session did not
  discover the replacement until the Owner pointed it out; there is no missing link on main.

- _Approach:_ Decide how sessions learn about newly applicable guidance before publication while their code branch
  intentionally waits for checkpoint-owned base reconciliation. Preserve explicit guidance-version authority and project
  overrides; do not add another link to already-wired workflows as a substitute for addressing stale loaded guidance.

- _Captured during:_ seam-lifecycle publication, PR #1027, 2026-10-16; requested after aligning the PR body with the
  newly landed format method.

---
