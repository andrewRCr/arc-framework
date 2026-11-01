# Projection test support

`seedProjection` lays a real projection in a new temporary repository: each record a test names is read from the store
and written at its path, a Markdown file stamped with its stored content's blob id, and the index records each file's
stat, what was written, and its base, written as an index commit so the reference follows it. Tests start from it
rather than building index entries by hand; tests of full materialization use materialization itself.

`createHistoryRefusingStore` wraps a store and refuses `history` for the records a test names with
`state-unresolvable`, naming the history ref a clone would fetch, `refs/arc/history/<work|cohort>/<uid>` from the
owner's stored UID, which the reference backend, holding no history refs, cannot return. Every other call passes
through unchanged, and each operation's calls are counted, so a test can show nothing was pulled or written.

`prepareSwap` readies one projected file's swap over a seeded projection: the record's next version stored and staged,
the replace guard's decision to replace it, and a batch that swaps it, taking the take-in, hooks, and file-system
operations a test passes. `deferring` is a take-in that defers every edit, and `landingCopies` one that lands a copy's
edit in the store whole, as a bound write-back would. `prepareRemoval` readies one projected file's removal the same way:
the guard's re-check with nothing staged, over an entry withheld where a test asks, and a batch that removes the file,
its path one the projection now lays another record at where a test asks.
