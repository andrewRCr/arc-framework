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

`start-guards.ts` refuses a second stored cut and held inbound entries only when starting a cut. Source conflicts,
copy prerequisites, lifecycle eligibility, and declared-profile checks stay in reusable derivation; acquisition checks
source conflicts before requiring complete inventory so a conflicted meta retains its specific repair evidence.
`machine-facts.ts` composes and authenticates the complete machine without further I/O.

`preflight.ts` repeats new-cut admission over fresh observations and emits a canonical starter map with author slots
for every source and dependency decision, without changing any record or history.

`bind-map.ts` decodes completed maps and compares their complete machine with freshly admitted preflight facts.
Wrong-shape continuations carry the supplied map operand unchanged; stale and unsupported maps name a fresh preflight.

`check-names.ts` checks member and newly created cohort names across live work items, former slugs, cohort documents,
and the map itself. It retains complete cohort observations for topology and Purpose checks, distinguishing reused open
documents from new ones and the completed-cohort exception for member names.

`check-homes.ts` resolves existing homes to open work units and applies allocation rights from active placement and
operator ownership. It retains canonical metadata identities while leaving target content and locator resolution to
the terminal batch; started meta and task-list allocations and document homes receive specific repairs.
