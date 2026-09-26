# Expected Behavior: Author Self-Review Finding

The response should establish that:

- the report is explicitly author self-review and uses only a report-local `F1` label;
- it includes the complete claim, locus, source-verification evidence, confirmed ARC `major` judgment, blocking fix
  action, and the absence of open questions;
- it omits rather than fabricates producer identity, reviewer grade, native label, ordinal, receipt, or producer-bound
  identity;
- complete-set approval is still required before mutation; and
- the governing caller proceeds directly after approval without invoking `arc review respond -`.

The retained expectations are a fixture oracle; only an attended fresh-context run supplies behavioral evidence.
