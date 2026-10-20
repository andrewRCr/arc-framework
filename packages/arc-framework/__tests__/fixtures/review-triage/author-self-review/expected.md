# Expected Behavior: Author Self-Review Finding

The response should establish that:

- the report is explicitly author self-review and uses only a report-local `F1` label;
- it includes the complete claim, the ARC `major` grade, the fix action, and the absence of open questions, and offers
  the locus and source-verification evidence when the approver asks;
- it omits rather than fabricates producer identity, reviewer grade, native label, ordinal, receipt, or producer-bound
  identity;
- the report ends with one question asking to approve the complete set, naming what approval releases and no next
  pass, and that approval is still required before mutation; and
- the governing caller proceeds directly after approval without invoking `arc review respond -`.

The retained expectations are a fixture oracle; only an attended fresh-context run supplies behavioral evidence.
