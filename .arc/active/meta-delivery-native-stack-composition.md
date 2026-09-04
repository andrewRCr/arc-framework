# Metadata: delivery-native-stack-composition

| **State**     | **Owner** | **Branch**                               | **Class** | **Priority** |
| ------------- | --------- | ---------------------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/delivery-native-stack-composition` | `Heavy`   | `P1`         |

- **Cohort:** `chunked-delivery`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-delivery-native-stack-composition.md`
- **Task List:** `tasks-delivery-native-stack-composition.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:e3aa9faeb9ad4e7fb0f791b783dc8da83667b2ff61a4eef8c3187fd4923f9d24`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 7.7 — Member 7 published, walked at member scope, and closed
- **Next Task:** `8.5.R.h`
- **Blockers:** The scoped review-fix verification renews itself: acknowledging it commits the machine-owned
  records, that commit moves the terminal head, and the rebind re-installs the verification just settled. Delivery
  cannot settle until Task 8.5.R.h reaches its fixed point.

- **Next Action:** Task 8.5.R.h — establish whether `driveDeliveryReviewFixContinuation` invokes its
  `settleRecordEffects` port before dispatching `delivery-reconcile`, and in which closure the settlement runs

- **PR URL:** [none]
- **Completed:** [none]

---
