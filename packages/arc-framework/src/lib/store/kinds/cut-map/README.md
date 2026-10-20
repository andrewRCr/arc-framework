# Cut-map records

`work-item/cut-map` stores a private wrapper containing the completed map and immutable owner birth bindings on its
origin. It is a single-writer machine record, never projected, with no in-repository persistence home.

`decodeCutMapContent` validates the strict wrapper and its completed map, retaining rejected field loci in a content
refusal. `writeCutMapRecord` renders canonical wrapper JSON without a trailing newline. The public `index.ts` exposes
the codecs and schemas; `registration.ts` installs parsing and atomic binding admission behind the store boundary.
Backend receipts supply generation identity; a binding alone supplies none. External authored maps retain their own
format and never include these private fields.
