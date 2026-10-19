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

Boundary access reads and writes version-one content; its public versioned shape can select a content version through
its type parameter. Store versions remain opaque, while repository-backed versions remain byte digests.
