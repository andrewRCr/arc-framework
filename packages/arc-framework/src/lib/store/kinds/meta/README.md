# Meta records

`writers.ts` exports the typed field, section, title, and creation writers; creation inputs contain fields only.
`projection.ts` owns the canonical field descriptors, value formatting, and fresh Markdown rendering.
`core-writers.ts` provides one typed writer per core-table cell, preserving bytes outside the three table rows.
`bullet-writers.ts` provides one typed writer per managed bullet, including the immutable promotion receipt.
`preformatted-writer.ts` adapts internal legacy setter values to the typed bullet writers.
`section-writer.ts` edits the Session Context body and rejects body lines that would delimit the section.
`line-reading.ts` shares exact core-table cells, bullet extents, and section bodies behind the raw-state boundary.
`registration.ts` installs the tolerant meta parser and declares its state-version handoff anchor. Parsed and durable
field schemas live in `lib/active/meta-schema.ts`; the filesystem reader and parser expose their public API through
`lib/active/meta-reader.ts`.
