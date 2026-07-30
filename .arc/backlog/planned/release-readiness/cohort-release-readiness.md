# Cohort: `release-readiness`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Parent:** [none]

**Purpose:** Coordinate the work that takes ARC from an internally developed npm package to a public,
maintainable release surface: the documentation platform and content, the public-release cut, release-lifecycle
aggregation, and later non-npm distribution. The cohort keeps those responsibilities separate while making the
release-critical sequence explicit.

---

## Coordination

The public documentation path has the cohort's only hard sequence:

```text
docs-site-refresh
  └─> docs-content-sweep
        └─> wu5-public-release
```

`docs-site-refresh` owns the documentation platform, structure, and deployment surface. `docs-content-sweep`
follows it so editorial and conceptual updates target the settled site shape. `wu5-public-release` consumes the
finished public documentation alongside the repository, community, and release-automation work needed for the
public cut.

`release-lifecycle` is a parallel design track for version-level aggregation of per-work-unit release information.
It owns release-model-agnostic lifecycle primitives, not publishing or distribution mechanics, and currently has
no hard dependency on the documentation sequence.

`binary-distribution` owns standalone executables and non-npm install channels. It is not release-blocking and
sequences after 1.0 as adoption warrants; its draft carries the softer requirement that a versioned release model
exist before binaries attach to releases.

### Shared contracts

- **Public documentation surface:** platform and structure belong to `docs-site-refresh`; content consolidation
  belongs to `docs-content-sweep`; the final publication decision belongs to `wu5-public-release`.
- **Release information versus release mechanics:** `release-lifecycle` owns aggregation semantics.
  `wu5-public-release` owns the public cut and npm automation; `binary-distribution` owns later non-npm channels.
- **Dependency authority:** hard sequencing remains in each member's `Depends On` field. This record explains the
  relationship but does not add hidden lifecycle edges.

---
