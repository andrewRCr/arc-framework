# Integration boundaries

The parser dispatches on the content's schema version. Version one uses the existing reader, including normalization
of retained delivery continuations; version two keeps each locus and its permitted actions and reservations, names
terminus decisions, and binds readiness by a nullable digest on publish-ready and publication-pending records alone.

Version two carries no copied policy or lane-owner version. Full convergence verification uses `merge`, and its
post-attest continuation carries the reviewed head and next action. Shared schemas keep ordinary actions,
reservations, Candidate identity, and exact member-vehicle uniqueness consistent across both versions.

The write check permits version two and refuses retained version one with a regeneration remedy. Registration
combines that check with the version-dispatched parser; retained version-one records remain readable.
