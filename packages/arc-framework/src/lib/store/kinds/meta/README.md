# Meta records

`projection.ts` owns the canonical field descriptors, value formatting, and fresh Markdown rendering.
`line-reading.ts` shares exact core-table cells, bullet extents, and section bodies behind the raw-state boundary.
`registration.ts` installs the tolerant meta parser and declares its state-version handoff anchor. Parsed and durable
field schemas live in `lib/active/meta-schema.ts`; the filesystem reader and parser expose their public API through
`lib/active/meta-reader.ts`.
