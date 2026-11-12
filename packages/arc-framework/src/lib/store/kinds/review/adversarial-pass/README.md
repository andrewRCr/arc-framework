# Adversarial passes

One immutable record retains an advisory evaluator's pass, approved finding dispositions, and report. Its activity
selects exact artifact versions: draft readiness binds a draft; spec finalization binds a spec and its input draft
when present; task generation and design amendment bind a spec and task list; verification and criteria also bind the
reviewed code head. Reports and finding accounts remain unstructured prose.

The header records the rubric, within-loop pass and cap, disposition approval, optional over-cap approval, and the
loop's stop reason, or null while the loop continues. Each finding has one approved action. The record grants no
next-pass permission. Its key's activity must match the header; the key's number counts stored passes across loops
and is independent of the header's within-loop ordinal.
