# Store decomposition

The cut map binds source content and dependency edges by stored-record identity.
`cut-map-machine.ts` defines its machine envelope and stable source, edge, and preflight identities.

`context.ts` binds all modes to one lifecycle executor's store and Git seam, together with the operator identity,
cohort template, inbound grammar, and terminal cleanup boundaries. Map inputs retain parsed JSON and its source operand.

`refusal.ts` validates mode outcomes, including text-only repairs and whole store refusals with their recovery
information lifted unchanged. `command-argv.ts` builds stored-map continuations for the shared command renderer.
`provenance.ts` distinguishes additive, terminal, discard, and revision batches in record history.

`acquire-origin.ts` retains the whole versioned origin group, projected artifact basenames, lifecycle inventory,
and stored-map observation. Incoming candidates exclude caller-supplied member UIDs while the full inventory remains
available for other checks. Start-only guards and pure machine derivation consume these observations separately.

`source-profile.ts` validates Design and Task List against stored artifact basenames. `source-facts.ts` derives the
record-bound source identity and kind, scans all planning artifacts or only an Active origin's design, and produces
canonically ordered allocation units with content digests.

`edge-facts.ts` caches identity lookups during acquisition and projects stable machine edges afterward. Incoming
dependents use current names and UIDs; outgoing providers keep authored slugs and resolve through live aliases or
terminal lineage, retaining slug identity when resolution is absent or ambiguous.
