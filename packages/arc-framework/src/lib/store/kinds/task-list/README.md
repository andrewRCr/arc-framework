# Task-list kind

`parseTaskListRecord` reads the header's Design filename above the first phase heading. Content decoding always
succeeds, including archived lists whose task lines do not satisfy the current structural scanner.

`registration.ts` installs that parser for `work-item/task-list`. The public index exposes the pure content API;
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
