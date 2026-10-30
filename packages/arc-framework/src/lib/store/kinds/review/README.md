# Review record kinds

The review family holds portable producer results and the decisions and evidence that apply to them.
Each kind owns its content schema, codec, storage identity, and any checks that need other records.

- `outcome/` stores one ended local, frontline, or hosted attempt and derives producer identity, pass counts, and
  settlement from stored responses.
- `decision/` stores immutable extra-pass grants, termini, lane skips, and withdrawals.
- `evidence/` stores an approved response with its exact result binding, monotonic performance, and settlement.
- `adversarial-pass/` records advisory review over exact planning and verification artifacts.
- `candidate/` validates the complete managed Candidate, including canonical identities and evidence references.
- `integration-boundary/` reads retained and current continuation formats, admits current writes, and derives the
  standard-lane readiness binding.

`index.ts` exposes schemas, codecs, identities, and derivations. Kind-owned registrations stay private to the store
and join its complete production list. The repository adapter uses a separate registration list and defers its
existing Candidate and boundary codecs until those records are read or written.

`paths.ts` resolves Candidate and boundary record paths through the semantic layout addresses.

`candidate/access.ts` and `integration-boundary/access.ts` provide typed reads and version-checked writes. Calls use
an explicitly supplied store, or open the checkout's store with the supplied Git runner. An explicit file port,
directly or under `fs`, retains filesystem-adapter behavior. Their prepared puts join the caller's own atomic batch.
The shared error constructors preserve version-conflict identity across typed access and filesystem adapters.

`outcome/access.ts`, `evidence/access.ts`, and `decision/access.ts` bind portable facts to one supplied store and work
item. Creates and evidence advances also expose prepared puts for an invocation's atomic batch. Listings distinguish
complete results from missed entries and unavailable observations, retaining the reported repair guidance.
`evidence/composed-record.ts` reconstructs native approved-disposition reads from a producer's evidence chain and
outcome, preserving optional tags, authorizations, and performed responses. Local and frontline command references
resolve to outcome keys; hosted references keep their acknowledged producer identity and lane-operation binding.

The review gate's `runtime/family-ports.ts` selects these ports from the invocation's backend capability. Repository
adapters remain selected before off-branch storage; working-state publication retains its separate numeric CAS port.

Boundary access reads and writes version-one content in the repository and accepts version two natively; its public
versioned shape can select a content version through its type parameter. Store versions remain opaque, while
repository-backed versions remain byte digests.

`candidate/history.ts` reads supersession chains and exact record revisions natively through stored record versions,
and in the repository through its plain path log, retaining Candidate versions introduced by merge commits that
rename-following history can omit.

`mapping-types.ts` describes the pure import's supplied source bytes, work-item table, returned records, and listing.
`mapping-work-items.ts` joins live work-unit and Errand identities to legacy lineages, including Candidate supersession.
`mapping-result.ts` resolves approved producer IDs to outcome keys while retaining the approved disposition content.
`mapping-listing.ts` accounts for gate files, tracked record versions, and materialization folders, retaining partial
mapping reasons and suppressing mapped references for an in-flight source.

`mapping-outcomes.ts` maps ended lane attempts using their original local, frontline, or hosted admissions. Source
codecs share pure persistence envelopes with the repository stores. Joined receipt and frontline files retain their
contributed outcome references; working state, ended owners, foreign repositories, and retired snapshots keep explicit
reasons. A pending live attempt blocks its entire lane file, and portable outcome times preserve legacy attempt order.

`mapping-evidence.ts` preserves every approved set, binding, advisory tag, policy snapshot, and succession edge.
It joins current or historical lane performance with complete Errand/member fix responses and partitions hosted
settlement by set, including carried receipts. Its source decoder is shared with legacy disposition enumeration.
Local disposition findings retain the evaluator identity recorded in their original request.

`mapping-operations.ts` keeps operation-file liveness and pending-attempt classification ahead of producer and decision
mapping. Authorization histories retain their content keys, withdrawals, and consumption citations through retries
and hosted acknowledgment. `mapping-boundary-decisions.ts` preserves Candidate/member termini and saved replay grants;
replay termini derive their logical pass basis from mapped outcomes, evidence, and Candidate ancestry. The replay
schema, decoder, and exact command-token parser are shared with the legacy handler. Duplicate decisions retain one
record and all contributing source references.

`mapping-candidates.ts` retains accepted whole source versions in order and classifies schema or supersession refusals
per version. `mapping-boundary.ts` converts every live boundary locus to version two, names imported termini, preserves
response operations and hosted producer IDs, and rewrites saved tokens with caller inputs alone. Readiness compares the
recorded native lane version before deriving the canonical digest over imported record content; its shared listing
input carries completeness evidence without requiring backend metadata. Missing or stale recorded versions stay unbound.
