---
name: testing-standards
description: Execution-time testing discipline applied when a task writes or modifies tests
related:
  - test-first
override-active: false
---

# Method: testing-standards

> - **Workflow:** [process-task-loop.md][process-task-loop]
> - **When:** A task writes or modifies tests — the self-gating trigger; inert otherwise
>
> - **Contract:** Tests verify observable behavior through faithful boundaries, fail before they pass, and
>   cover error and boundary paths.
> - **Related:** [test-first](test-first.md) — the two methods partition the testing apparatus along the
>   planning / execution seam, so overriding one should prompt review of the other.

## testing-standards.override

[No override configured]

## testing-standards.default

- Test observable behavior through public interfaces; don't assert on implementation — including **don't assert
  on spy / call args as the outcome** (that verifies wiring, not behavior).
- **Keep mocked boundaries faithful** — a stub returning what the real dependency never would (including
  success-shaped where it would error) passes against a fiction; cover response-dependent behavior at a tier
  that runs the real thing.
- **See it fail first** — a test that has never failed may assert nothing.
- **One behavior at a time; don't batch all tests upfront** — bulk tests test imagined behavior.
- **Mock at boundaries; never mock internals** — if that is hard, the interface is wrong, not the test; don't
  test your dependencies.
- **Design for testability** — inject dependencies; separate computation from I/O.
- **Keep tests isolated** — no test depends on another's state or run order; reset shared state between tests.
- **Cover error and boundary paths.**
- **Meaningful assertions over coverage targets.**

---

[process-task-loop]: ../workflows/arc/process-task-loop.md
