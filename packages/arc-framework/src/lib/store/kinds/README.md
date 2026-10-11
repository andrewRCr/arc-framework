# Record kinds

Each kind owns its parsed fields, pure writers, and write rules. Its `registration.ts` installs a content parser,
any write check, and state-version anchor declarations through `defineKindRegistration`. `registrations.ts` holds
the production set used by storage backends; callers read records through the store rather than importing it.

| Folder  | Kind             | Interface                                     |
| ------- | ---------------- | --------------------------------------------- |
| `meta/` | `work-item/meta` | Tolerant metadata parser and its registration |

Registration modules remain behind the store's raw-state import boundary; schemas and pure writers are public.
