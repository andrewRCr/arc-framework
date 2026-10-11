# Task-list kind

`parseTaskListRecord` reads the header's Design filename above the first phase heading. Content decoding always
succeeds, including archived lists whose task lines do not satisfy the current structural scanner.

`registration.ts` installs that parser and the complete six-rule check for `work-item/task-list`. The public index
exposes the pure content API;
`lib/task-list/` supplies structural scans, cursors, and other derived views over the returned record content.

`writeTaskMarker` completes or defers exactly one scanned task by identifier, preserving all other bytes. It refuses
malformed lists, missing or ambiguous identifiers, and edits that leave the task structure invalid.

`spliceDeliveryPlanSection` replaces one marked region, or one provisional unmarked Delivery Plan section, with
already-rendered text. Its sentinels and replacement-locus refusals belong to the kind; plan validation and rendering
remain with delivery.

`line-pairing.ts` pairs scanned task items by identifier, including repeated identifiers in source order. It retains
unmatched prior lines and explicit scan availability for rules that compare markers, completed intent, and shape.

`authority-rules.ts` protects task closure and changes to existing closed markers under hand-edit provenance. It also
protects exact marked delivery-plan bytes, including the markers, while leaving the unmarked provisional section
editable. A prior structural scan failure removes marker comparison authority; readable managed-region bytes remain
protected independently of task-line syntax.

`integrity-rules.ts` retains completed identifier occurrences and their own Goals for every writer. `goal-reading.ts`
uses the existing descriptor grammar for parent Goals and each subtask's bounded, dedented body, keyed by physical
line to keep repeated identifiers separate. Goal text follows the delivery inventory's whitespace normalization;
failed proposed scans report unavailable retention evidence rather than claiming an unchanged target disappeared.

`shape-rules.ts` checks only added or changed root descriptor clusters and newly introduced segmentation diagnostics.
Cluster comparisons follow paired parent lines and include separators; diagnostic identity ignores physical line
shifts and matches scanner failures by code alone. `check.ts` collects all six rules without stopping at the first.
