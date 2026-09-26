# Expected Behavior: Unsupported Material Finding

The response should establish that:

- the rejected finding remains part of the complete approved disposition set;
- the all-refuted pass converges because source verification confirmed no material finding;
- the result is reported as `Pass 1 of 2` with stop reason `converged`; and
- no additional pass runs merely because the reviewer reported `major`.

These retained expectations are a fixture oracle; only an attended fresh-context run supplies behavioral evidence.
