# Task List: Review Signal Convergence

- **Design:** `spec-review-signal-convergence.md`

---

## **Phase 1:** Establish the strict review-severity vocabulary

_Purpose:_ Replace the review magnitude baseline first so every later schema, record, and workflow change builds on
one unambiguous `critical > major > minor` vocabulary.

### `[ ]` **1.1 Change the canonical review-severity model**

- _Spec anchors:_ Proposed Design § 2; Success Criterion 2
- _Rough subtask count:_ 2-3

### `[ ]` **1.2 Propagate `critical` through review producers and consumers**

- _Spec anchors:_ Proposed Design § 2; Success Criteria 2 and 11
- _Rough subtask count:_ many

### `[ ]` **1.3 Reconcile schemas, fixtures, generated artifacts, and occurrence-sensitive prose**

- _Spec anchors:_ Proposed Design § 2; Compatibility and Migration; Success Criteria 2 and 11
- _Rough subtask count:_ many

## **Phase 2:** Separate provider observation from ARC judgment

_Purpose:_ Make reported and verified severity distinct, source-bound facts before either disposition gating or pass
convergence consumes them.

### `[ ]` **2.1 Split the canonical disposition item and enforce provenance invariants**

- _Spec anchors:_ Proposed Design § 4; Success Criteria 5 and 8
- _Rough subtask count:_ 2-3

### `[ ]` **2.2 Rebuild proposal preparation and exact-source validation around the split fields**

- _Spec anchors:_ Proposed Design § 4; Success Criteria 5 and 6
- _Rough subtask count:_ many

### `[ ]` **2.3 Produce a faithful standalone disposition presentation**

- _Spec anchors:_ Proposed Design § 4; Success Criterion 6
- _Rough subtask count:_ 2-3

### `[ ]` **2.4 Align triage and response guidance with verified-only control**

- _Spec anchors:_ Proposed Design §§ 4 and 7; Success Criteria 5, 6, and 10
- _Rough subtask count:_ 2-3

## **Phase 3:** Bind review execution to logical pass and scope

_Purpose:_ Give local and frontline operations a runtime-owned execution identity that distinguishes passes without
confusing logical pass accounting with retry generation.

### `[ ]` **3.1 Define and register the review execution binding**

- _Spec anchors:_ Proposed Design § 5; Success Criterion 8
- _Rough subtask count:_ 2-3

### `[ ]` **3.2 Thread execution binding through operation identities and durable state**

- _Spec anchors:_ Proposed Design § 5; Success Criteria 7 and 8
- _Rough subtask count:_ many

### `[ ]` **3.3 Prove pass, retry, scope, and fallback identity behavior**

- _Spec anchors:_ Proposed Design § 5; Testing; Success Criterion 8
- _Rough subtask count:_ 2-3

## **Phase 4:** Persist complete results across frontline and hosted lanes

_Purpose:_ Generalize the existing version-checked result substrate and make hosted terminal outcomes available through
the same opaque, source-bound preparation path.

### `[ ]` **4.1 Generalize the result record, store port, and Git-common implementation**

- _Spec anchors:_ Proposed Design § 5; Storage Evolution; Success Criterion 7
- _Rough subtask count:_ many

### `[ ]` **4.2 Carry policy, rubric, pass, and scope binding through hosted execution**

- _Spec anchors:_ Proposed Design § 5; Success Criteria 7 and 8
- _Rough subtask count:_ 2-3

### `[ ]` **4.3 Persist hosted terminal results with distinct operation and content identities**

- _Spec anchors:_ Proposed Design § 5; Success Criterion 7
- _Rough subtask count:_ 2-3

### `[ ]` **4.4 Extend source references and response preparation to hosted results**

- _Spec anchors:_ Proposed Design §§ 4, 5, and 7; Success Criteria 5, 7, and 10
- _Rough subtask count:_ many

## **Phase 5:** Derive convergence from durable operation evidence

_Purpose:_ Replace caller assertions with command-bound validation of complete producer and disposition records while
keeping deterministic policy reduction free of storage I/O.

### `[ ]` **5.1 Add operation references to terminal review attempts**

- _Spec anchors:_ Proposed Design § 6; Success Criterion 8
- _Rough subtask count:_ 2-3

### `[ ]` **5.2 Validate producer, binding, outcome, and disposition completeness**

- _Spec anchors:_ Proposed Design § 6; Success Criteria 8 and 9
- _Rough subtask count:_ many

### `[ ]` **5.3 Fail safely on incomplete chunk convergence evidence**

- _Spec anchors:_ Proposed Design §§ 5 and 6; Non-Goals; Success Criteria 8 and 9
- _Rough subtask count:_ 2-3

### `[ ]` **5.4 Derive verified severity summaries and policy convergence**

- _Spec anchors:_ Proposed Design §§ 3 and 6; Success Criteria 3, 8, and 9
- _Rough subtask count:_ many

## **Phase 6:** Converge every review lane on one execution order

_Purpose:_ Ensure approved judgment reaches the driver before response performance, and ensure target movement
invalidates every action bound to the earlier target.

### `[ ]` **6.1 Preserve approved response plans through policy resolution**

- _Spec anchors:_ Proposed Design § 7; Success Criterion 10
- _Rough subtask count:_ 2-3

### `[ ]` **6.2 Implement unchanged-target continuation and changed-target rerouting**

- _Spec anchors:_ Proposed Design §§ 6 and 7; Success Criteria 9 and 10
- _Rough subtask count:_ many

### `[ ]` **6.3 Reorder integration review lanes and remove deferred record-only approval**

- _Spec anchors:_ Proposed Design § 7; Success Criterion 10
- _Rough subtask count:_ many

### `[ ]` **6.4 Reorder Errand review lanes under the same invariant**

- _Spec anchors:_ Proposed Design § 7; Success Criterion 10
- _Rough subtask count:_ many

### `[ ]` **6.5 Prove lane ordering and outstanding-response handling**

- _Spec anchors:_ Proposed Design § 7; Testing; Success Criterion 10
- _Rough subtask count:_ 2-3

## **Phase 7:** Close the agent-managed review contract

_Purpose:_ Align advisory coverage, disposition completeness, pass convergence, and cap authority with the durable
machine protocol after its control-bearing semantics are settled.

### `[ ]` **7.1 Define `withstood` as attention without clearance**

- _Spec anchors:_ Proposed Design § 1; Success Criterion 1
- _Rough subtask count:_ 2-3

### `[ ]` **7.2 Separate completeness, convergence, and cap-exhaustion authority**

- _Spec anchors:_ Proposed Design § 3; Success Criteria 3 and 4
- _Rough subtask count:_ 2-3

### `[ ]` **7.3 Lock the adversarial-review contract across both methodology copies**

- _Spec anchors:_ Proposed Design §§ 1 and 3; Testing; Success Criteria 1, 3, 4, and 11
- _Rough subtask count:_ 2-3

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`
