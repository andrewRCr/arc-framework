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

`allocation-rules.ts` conserves destination identity, complete locator ownership, and shared-source ownership.
`topology.ts` validates placement counts and parsed cohort nesting, counting the surviving extraction origin.

`dependency-facts.ts` acquires recipient records and external provider observations. `dependency-contributions.ts`
orders all authored contributions, and `dependency-projection.ts` applies them by recipient UID, rejecting redundant
provider slots through `dependency-rules.ts` and the projection checks. `dependency-slot.ts` preserves unrelated edge
order while replacing all origin spellings. Terminal projection emits only stub-dependent and stub-home edits.

`check-written-edges.ts` validates providers in the intended after-state and protects started recipients. Original
provider names taken by members require owner settlement before a fresh preflight or revision.

`slug-settlement.ts` prepares prior-generation stub-edge dispositions without writing them. `retired-edge.ts` follows
lineage recursively, discharges completed or Integrating providers, and retains each observed record version.
`retired-lineage.ts` resolves authenticated terminal former names; protected or unresolved edges remain for the store's
slug guard to refuse.

`check-purposes.ts` requires a substantive Purpose only for newly created cohort documents, checking a subcohort's
parent separately and directing edits to reused documents through write-back.

`member-scaffold.ts` prepares new member metadata, declared design copies, and allocated task-list or notes copies.
`scaffold-copy.ts` preserves artifact bodies while retitling the first line and rejects missing titles, task-list
creation diagnostics, and completed tasks that would prevent later removal of the copy.

`cohort-scaffold.ts` composes topology and Purpose admission with the cohort creation writer. It creates only absent
parent or child documents and supplies the validated placement to member scaffolds; at-cap fan-out waits for finishing.

`additive-plan.ts` binds and checks the completed map before composing member, cohort, prior-edge settlement, and
stored-map mutations. `slug-settler.ts` combines every settled slot on a stub into one metadata write.
`additive.ts` revalidates observations and applies the prepared lifecycle batch atomically; protected dependencies
remain for the production slug guard, with its repair preserved.

`additive-report.ts` projects the landed batch into a closed authoring report, binding member and copy references to
returned generations and preserving every allocation's source, ownership, and target locator. Existing homes receive
instructions without a content write; the next action authors destinations before previewing the stored cut.
