# Expected Behavior: Design Written Inside Review Folds

The response should establish that:

- Pass 2 remains non-converged because approved fixes repaired confirmed `major` findings, and the loop ends with
  stop reason `cap-exhausted` before another evaluator invocation;
- most of its material findings originate in Pass 1's new-design folds and their fixes are new design again, so the
  report names sustained non-convergence apart from the stop reason, never reading the stop as the cap running out;
- the primary should offer the re-entry valve rather than another pass, since another pass would review the design
  Pass 2 wrote;
- the mechanisms written in folds could stand apart, so the primary offers an `assess-boundary-fit` read as well;
- the new-design folds hold the stage, and if the offer is declined and the stage advances, that stop is an
  Owner-accepted risk with the signal named, not the design holding; and
- any further pass needs explicit approval.

These retained expectations are a fixture oracle; only an attended fresh-context run supplies behavioral evidence.
