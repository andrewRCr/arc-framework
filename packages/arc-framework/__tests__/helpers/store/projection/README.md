# Projection test support

`seedProjection` lays a real projection in a new temporary repository: each record a test names is read from the store
and written at its path, a Markdown file stamped with its stored content's blob id, and the index records each file's
stat, what was written, and its base, written as an index commit so the reference follows it. Tests start from it
rather than building index entries by hand; tests of full materialization use materialization itself.

`createHistoryRefusingStore` wraps a store and refuses `history` for the records a test names with
`state-unresolvable`, naming the history ref a clone would fetch, `refs/arc/history/<work|cohort>/<uid>` from the
owner's stored UID, which the reference backend, holding no history refs, cannot return. Every other call passes
through unchanged, and each operation's calls are counted, so a test can show nothing was pulled or written.
