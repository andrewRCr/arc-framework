# Scenario: Unsupported Material Finding

- Activity: task-list readiness adversarial review.
- Result: Pass 1 of 2.
- Reviewer finding `F1`: `major` — "The rollback procedure is absent."
- Source check: the reviewed task list has a complete rollback procedure under `Recovery`, so the finding is
  unsupported.
- Approved complete disposition set: `F1` is rejected because the cited omission is contradicted by source.
- Response performance: complete; rejection requires no artifact mutation.
- Additional-pass authorization: none.

Report the completed pass and decide whether this loop ended or another evaluator may run.
