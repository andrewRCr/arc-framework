# Metadata: ADR Proposed→Accepted Timing

| **State**     | **Owner** | **Branch**               | **Class** | **Priority** |
| ------------- | --------- | ------------------------ | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/adr-accept-timing` | `Heavy`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-adr-accept-timing.md`
- **Task List:** `tasks-adr-accept-timing.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:c9cba45ea2f2ec5fbe1de6f083e302b68613008648c98be85ca7bce0b551f3db`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 5.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

---

## Release Notes Entry

Architecture decision records are accepted in the change that completes their work and remain editable until that
change merges. Planning checks now identify decisions that need an ADR at every work-unit class and planning depth.

### Changed

- Clarified ADR creation, acceptance, and amendment timing, including records already Proposed on the base branch.
- Required an ADR disposition for qualifying planning decisions and reader-independent rationale in ADR bodies.
- Updated ADR templates to place the initial status before authoring guidance.

## Completion Notes

Delivered the ADR lifecycle guidance, planning-readiness criterion, and repository-owned status and number checks.
The checks inspect exact Git trees, distinguish an existing Proposed record from a newly added or regressed one,
and report actionable acceptance, base-resolution, and collision-renumbering remedies. ADR-023, ADR-024, ADR-025,
and ADR-033 now record acceptance with historical realization evidence; ADR-020 remains Proposed. ADR-040 records
the delivered decision and is Accepted. Package-source methodology, template, and index changes match their project
copies.

Verification met all 15 task-list criteria, exercised refusal and repaired-continuation scenarios through the real
controller, and passed the forced local merge gate. Normal hosted CI run 42046311900 passed at code head
2428dc459d24e27f97218559a09031751b64a85f without diagnostic inputs. The independent verification review identified
one minor parser gap for underlined Markdown headings; six fail-first regressions and the 78-test focused run
verified its correction. A source-capture refusal cleared on its prescribed retry; its cause remains unconfirmed.

The complete hosted review at 785dd8788df1743681535111eecf85234d9aad0a produced one unsupported roadmap finding,
rejected after checking the live branch and generated-view contract, with the response approved and thread settled.
There were no supported implementation findings. Integration retains the active Integrating metadata; archival and
physical cleanup follow the separate post-merge landing bridge.
