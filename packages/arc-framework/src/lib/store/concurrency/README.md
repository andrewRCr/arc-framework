# Pure concurrency functions

Import the public API from `index.ts`. The library performs no I/O and accepts caller-supplied labels and randomness.

- `splitEntryList` and `rejoinEntryList` retain document bytes while recognizing heading or field-header entries in
  caller-named sections. HTML comments cannot introduce entries. Trailing separators remain distinct from entry bodies.
- `stampEntryIds` adds missing backtick-delimited `_Id:_` fields, reserving existing IDs and redrawing collisions.
- `mergeLineText` merges line arrays with final newline presence handled separately. Conflicting hunks retain current
  text and return labelled conflict records rather than inline markers.
- `mergeEntryText` reconciles whole entries by ID and section. Concurrent edits survive observed removals; insertion
  anchors and ID ordering make disjoint inserts deterministic. Surrounding prose and separators merge independently.
- `generateRankBetween` implements the classic base-62 fractional rank format. `placeRankedStub` accepts a sorted list
  and an insertion index after removing the moved UID, returning the atomic rank assignments needed to resolve ties.

Merge inputs must already have distinct managed IDs. Returned conflicts use the store core's reference and label types.
The `node-diff3` dependency stays behind `line-merge.ts`; its types never enter the public API. Rank arithmetic adapts
rocicorp's CC0 fractional-indexing algorithm without custom alphabets.
