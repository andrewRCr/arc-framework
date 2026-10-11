# Task-list kind

`parseTaskListRecord` reads the header's Design filename above the first phase heading. Content decoding always
succeeds, including archived lists whose task lines do not satisfy the current structural scanner.

`registration.ts` installs that parser for `work-item/task-list`. The public index exposes the pure content API;
`lib/task-list/` supplies structural scans, cursors, and other derived views over the returned record content.

`writeTaskMarker` completes or defers exactly one scanned task by identifier, preserving all other bytes. It refuses
malformed lists, missing or ambiguous identifiers, and edits that leave the task structure invalid.
