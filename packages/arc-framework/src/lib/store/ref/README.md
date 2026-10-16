# Ref backend

Private implementation of operational state in repository refs. The composition boundary is `lib/store/create.ts`;
tests use its `createRefStore` export. Runtime imports of this directory stay inside `lib/store/`.

`RefStorePorts` supplies filesystem and Git access, identity and actor resolution, clock and sleep controls, randomness,
and lock acquisition. Construction binds pure defaults and failure-time Git checks without consulting those ports.
Operation modules share the resolved context, while identity remains callable for each operation.
