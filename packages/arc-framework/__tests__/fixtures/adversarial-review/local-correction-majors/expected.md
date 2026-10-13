# Expected Behavior: Majors That Correct an Intact Design

The response should establish that:

- Pass 2 remains non-converged because approved fixes repaired confirmed `major` findings, and the loop ends with
  stop reason `cap-exhausted` before another evaluator invocation;
- every fold is a local correction, so the primary does not offer the re-entry valve on the count of majors;
- `R1` is a correction left incomplete, so it calls for another fix-check round rather than re-entry;
- the design holds, so once that round settles the spec stage may advance on the `cap-exhausted` result without
  treating it as an accepted risk; and
- the cap recommendation weighs severity and the fold tags together, and any further pass needs explicit approval.

These retained expectations are a fixture oracle; only an attended fresh-context run supplies behavioral evidence.
