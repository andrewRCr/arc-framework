# Record kinds

Each kind owns its parsed fields, pure writers, and write rules. Its `registration.ts` installs a content parser,
any write check, and state-version anchor declarations through `defineKindRegistration`. `registrations.ts` holds
the complete production set used by storage backends; `in-repo-registrations.ts` keeps the repository adapter's
registration set independent of deferred review codecs. Callers read records through the store.

| Folder                         | Kind                          | Interface                                                                    |
| ------------------------------ | ----------------------------- | ---------------------------------------------------------------------------- |
| `meta/`                        | `work-item/meta`              | Metadata projection, shared line reading, and registered parsing             |
| `lineage/`                     | `lineage/transition`          | Closed terminal history, canonical creation, and content parsing             |
| `task-list/`                   | `work-item/task-list`         | Tolerant header fields and pure task-list content operations                 |
| `review/outcome/`              | `review/outcome`              | Immutable ended attempts, producer bindings, pass and settlement derivations |
| `review/decision/`             | `review/decision`             | Immutable choices, stable identities, and cross-record admission             |
| `review/evidence/`             | `review/evidence`             | Approved responses and monotonic performance, succession, and settlement     |
| `review/adversarial-pass/`     | `review/adversarial-pass`     | Advisory passes over exact artifact versions                                 |
| `review/candidate/`            | `review/candidate`            | Whole managed Candidate content with recomputed identities                   |
| `review/integration-boundary/` | `review/integration-boundary` | Versioned continuations and canonical readiness binding                      |

The meta's `line-reading.ts` shares core-table cells and bullet extents between parsing and writers; it stays behind
the raw-state import boundary beside the registration modules.

Registration modules remain behind the store's raw-state import boundary; schemas and pure writers are public.

`design/` exposes the shared raw Purpose reader for draft, spec, and companion content, together with the code-span
offset reader used by status's sentence presentation.

`cohort/` exposes Purpose and the authoritative Parent slug, with structural refusals retained by its registration.

`work-item/` contains the slug acquisition and former-name rules shared by primary record kinds.
`rule-support.ts` preserves available, absent, and unavailable read evidence for content checks.

`errand-record/` registers both shared slug rules for the Errand primary, over the supplied batch views.
