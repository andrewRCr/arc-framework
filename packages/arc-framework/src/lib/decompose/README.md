# Store decomposition

The cut map binds source content and dependency edges by stored-record identity.
`cut-map-machine.ts` defines its machine envelope and stable source, edge, and preflight identities.

`context.ts` binds all modes to one lifecycle executor's store and Git seam, together with the operator identity,
cohort template, inbound grammar, and terminal cleanup boundaries. Map inputs retain parsed JSON and its source operand.

`refusal.ts` validates mode outcomes, including text-only repairs and whole store refusals with their recovery
information lifted unchanged. `command-argv.ts` builds stored-map continuations for the shared command renderer.
`provenance.ts` distinguishes additive, terminal, discard, and revision batches in record history.
