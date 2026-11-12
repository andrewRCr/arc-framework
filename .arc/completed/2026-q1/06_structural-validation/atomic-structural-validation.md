# Completed Atomic Tasks — 2026 Q1

- [x] **Strengthen "review increment" terminology and add ARC vocabulary reference**
    - **Outcome:** Added Key Concepts table (9 terms) to `strategy-core-philosophy.md` after "What ARC Is".
      Threaded "review increment" into DEV-RULES.ARC.md § "One task at a time" and process-task-loop § "One task
      at a time" — replacing "work unit" with "review increment" where it described the checkpoint concept.
    - **Files:** `strategy-core-philosophy.md`, `DEV-RULES.ARC.md`, `3_process-task-loop.md`

    - **Branch:** `technical/structural-validation`

- [x] **Add sub-agent delegation guidance to DEV-RULES.ARC.md**
    - **Outcome:** Added "Sub-agent scope · P2, P3" subsection under Task Execution, between "One task at a time"
      and "Task granularity". Covers appropriate uses (parallel investigation, research, token-heavy analysis) and
      the anti-pattern (delegating review-increment-level task work bypasses co-development). Updated TOC line.
    - **Files:** `DEV-RULES.ARC.md`

    - **Branch:** `technical/structural-validation`

- [x] **Add atomic task capture routing to process-task-loop**
    - **Outcome:** Added "Where to Capture Atomic Tasks" subsection to Incidental Work Management, after the
      sizing decision tree. Mode-aware routing: WU-domain → per-task-list section (all modes); outside WU domain →
      ATOMIC-TASKS.md (arc-in-git) or session notes/external tracker (none/external).
    - **Files:** `3_process-task-loop.md`

    - **Branch:** `technical/structural-validation`
