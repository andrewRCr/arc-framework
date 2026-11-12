# Concurrency behavior tests

Tests exercise the public pure functions with deterministic fixtures and generated entry lists, text, and ranked stubs.
They cover lossless parsing, managed field compatibility, identity collisions, whole-entry conflicts, observed removals,
section moves, insertion ordering, surrounding prose, and final newline preservation.

The architecture test checks resolved imports, exports, and dynamic imports against the pure dependency boundary. The
line merge declaration test verifies that emitted public types expose no third-party merge types. Property tests check
byte preservation against an unchanged side, entry conservation and role symmetry, and strict rank ordering with ties.
