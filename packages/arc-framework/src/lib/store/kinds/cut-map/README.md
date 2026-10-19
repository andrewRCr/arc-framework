# Cut-map records

`work-item/cut-map` stores one completed decomposition map on its origin. It is a single-writer machine record,
never projected, with no in-repository persistence home.

`decodeCutMapContent` parses JSON through the completed-map decoder and preserves the first issue's code, path, and
message in a content refusal. `writeCutMapRecord` renders canonical JSON without a trailing newline. The public
`index.ts` exposes both pure operations; `registration.ts` installs the parser behind the store boundary.
