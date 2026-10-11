# Record kinds

Each kind owns its parsed fields, pure writers, and write rules. Its `registration.ts` installs a content parser,
any write check, and state-version anchor declarations through `defineKindRegistration`. `registrations.ts` holds
the production set used by storage backends; callers read records through the store rather than importing it.

| Folder       | Kind                  | Interface                                                        |
| ------------ | --------------------- | ---------------------------------------------------------------- |
| `meta/`      | `work-item/meta`      | Metadata projection, shared line reading, and registered parsing |
| `lineage/`   | `lineage/transition`  | Closed terminal history, canonical creation, and content parsing |
| `task-list/` | `work-item/task-list` | Tolerant header fields and pure task-list content operations     |

The meta's `line-reading.ts` shares core-table cells and bullet extents between parsing and writers; it stays behind
the raw-state import boundary beside the registration modules.

Registration modules remain behind the store's raw-state import boundary; schemas and pure writers are public.

`design/` exposes the shared raw Purpose reader for draft, spec, and companion content, together with the code-span
offset reader used by status's sentence presentation.

`cohort/` exposes Purpose and the authoritative Parent slug, with structural refusals retained by its registration.
