# ARC Integration Mapping — Methodology-Specific Integration Points

**Date:** 2026-02-23\
**Purpose:** Identify specific, concrete integration points between ARC constructs
and existing development methodologies\
**Audience:** ARC development team planning integration guidance and adoption materials

> **Disclaimer:** This document is *research input*, not validated design decisions.
> The integration opportunities, fit assessments, and adoption prioritizations here
> represent preliminary analysis grounded in the methodology landscape research. Actual
> ARC integration strategy will be decided through the ADR process. Treat this as
> reference material for those discussions, not as approved direction.

---

## Quick Reference: Integration Suitability

| Methodology              | Fit       | Effort     | Primary Value                            | Secondary Value                 |
| ------------------------ | --------- | ---------- | ---------------------------------------- | ------------------------------- |
| **Dual-Track Agile**     | Very High | Low        | Discovery + Delivery alignment           | Session continuity              |
| **Scrum (standard)**     | High      | Low        | Task spec clarity with AI; Quality gates | Approval workflow documentation |
| **Scrum (distributed)**  | Very High | Low        | Async handoffs; Session continuity       | Approval gates reduce meetings  |
| **Kanban**               | High      | Very Low   | Documentation-as-workflow                | Approval gates between stages   |
| **Scrumban**             | High      | Low        | Best of both: structure + flow           | Task spec for planning          |
| **Continuous Discovery** | High      | Low        | Discovery validation tracking            | Delivery workflow clarity       |
| **DevOps/SRE**           | High      | Low        | Quality gates + observability            | Session continuity for on-call  |
| **Lean (principles)**    | Medium    | Very Low   | Waste identification + task tracking     | Value stream documentation      |
| **SAFe**                 | Medium    | Medium     | Portfolio + team alignment               | Hierarchical approval gates     |
| **Shape Up**             | Medium    | Low-Medium | Task spec for pitched projects           | Betting decision documentation  |
| **Waterfall (mixed)**    | Medium    | Medium     | Changeability overlay                    | Documentation management        |
| **Solo Developer**       | Very High | Very Low   | Session continuity                       | Structured task execution       |
| **FDD**                  | Low-Med   | Medium     | Feature-centric task tracking            | Domain model documentation      |
| **RUP / Traditional**    | Low-Med   | Medium     | Phase documentation + gates              | Artifact management             |
| **Crystal**              | Medium    | Low        | Team documentation + improvement         | Reflective improvement tracking |

---

## DETAILED INTEGRATION MAPPINGS

### 1. DUAL-TRACK AGILE ⭐⭐⭐⭐⭐ Highest Value

**Current Structure:**

- Discovery track: Weekly customer interviews, assumption testing, learning cycles
- Delivery track: Scrum sprints or Kanban flow
- Integration point: Validated ideas move from discovery backlog to delivery backlog

**ARC Integration Opportunities:**

**A. Discovery Track Task Specification**

```
Discovery Work Unit (Weekly)
├─ Task: Customer Interview Round
│  ├─ Objective: Validate hypothesis about feature X
│  ├─ Success criteria: 5+ qualitative interviews completed, patterns identified
│  └─ Approval: Product Manager validates learning
├─ Task: Assumption Testing
│  ├─ Objective: Test assumption that users prefer X over Y
│  ├─ Deliverables: Test design, participant list, results analysis
│  └─ Approval: Discovery Lead signs off on validity
└─ Task: Delivery Readiness Decision
   ├─ Objective: Decide if feature validated enough for delivery backlog
   ├─ Delivery: Decision record (validated / needs more research / reject)
   └─ Approval: Product trio (PM, Designer, Engineer) alignment
```

**B. Discovery → Delivery Handoff Ceremony**

- ARC's work unit transitions can formalize discovery-to-delivery handoff
- Session notes capture learning context for delivery team
- Eliminates risk of delivery team not understanding discovery rationale
- Reduces rework from "why are we building this?" questions in sprint

**C. Tracking Learning Velocity**

- Parallel to story points for delivery track
- Learning velocity: "validated learnings per week" rather than "code delivered"
- ARC approval gates provide structure for validating learning quality

**Value Proposition:** Dual-Track is about ensuring you build the *right* product while building it *right*. ARC's
structured approval gates help validate "rightness" systematically rather than informally.

**Adoption Path:**

1. Formalize discovery tasks with ARC structure (minimal effort; adds clarity)
2. Use ARC approval workflow for discovery-to-delivery handoff (medium effort; solves real pain point)
3. Integrate learning metrics with delivery velocity tracking (ongoing)

---

### 2. SCRUM (STANDARD TEAM) ⭐⭐⭐⭐ High Value

**Current Structure:**

- Sprint Planning (define committed work)
- Daily Standup (track progress)
- Sprint Review (show increment)
- Retrospective (improve process)

**ARC Integration Opportunities:**

**A. Task Specification for Story Implementation**

- User story: "As a user, I want to login with email so I can access my account"
- ARC task structure adds concrete implementation details:

    ```
    Delivery Task: Email Login Implementation
    ├─ Objective: Enable users to authenticate via email
    ├─ Acceptance Criteria: [from story + refined details]
    ├─ Technical Context: [architecture constraints, existing patterns]
    ├─ Edge Cases: [missing email, invalid format, rate limiting]
    └─ Quality Gates: [unit tests passing, integration tests, security review]
    ```

- **Why this helps:** Reduces ambiguity during implementation; helps AI code generation understand constraints; provides
  context for junior developers

**B. Approval Gates Instead of Code Review**

- Traditional Scrum: code review is informal (or in dedicated sprint phase)
- ARC approach: approval gates formalize review points

    ```
    Story Review Workflow:
    ├─ Implementation Task → Ready for Review approval
    ├─ Code Review approval → Ready for Testing
    ├─ Testing/QA approval → Ready for Integration
    └─ Product Owner approval → Story accepted
    ```

- **Why this helps:** Makes review responsibilities explicit; prevents "nobody reviews this" issues; documents what was
  checked
- **Bonus:** Works better than Scrum's "all reviews happen in last days of sprint" bottleneck

**C. Structured Sprint Retros**

- ARC can structure retro findings into documented improvements:

    ```
    Retrospective Finding: "Code reviews taking too long"
    ├─ Actual Cause: [diagnosis from discussion]
    ├─ Action Item: [specific improvement to try]
    ├─ Owner: [who drives this]
    ├─ Validation Gate: [how we'll know it worked]
    └─ Review Date: [when we check]
    ```

- **Why this helps:** Retro findings actually get acted on (documented accountability); improvement tracking visible

**D. Distributed Scrum Team Handoffs**

- Scrum standup assumes same timezone; distributed teams struggle
- ARC session handoff protocol fills this gap:

    ```
    End of Session:
    ├─ What I did: [completed tasks, decisions made]
    ├─ Current blockers: [waiting on, needs input]
    ├─ Next session starts with: [highest priority, what to unblock first]
    └─ Context preserved: [links to discussions, decisions, technical notes]
    ```

- **Why this helps:** Next timezone doesn't waste 30 min figuring out context; standup time used for coordination, not
  context recovery

**E. AI-Assisted Development Quality Gates**

- Story points meaningless with AI assistance (same story: 2 hrs with AI, 8 hrs without)
- ARC's task structure + approval gates provide alternative tracking:

    ```
    Traditional: "Story worth 5 points, took 1 person 3 days"
    ARC + AI: "Story completed in 8 hours with AI; passed 4 approval gates; 2 iterations on review"
    ```

- **Why this helps:** Tracks actual progress (gate passage) not effort; AI assistance transparent; quality visible

**Value Proposition:** Scrum is good at iteration but weak on documentation, cross-timezone handoffs, and approval
clarity. ARC strengthens these without replacing Scrum.

**Adoption Path:**

1. Introduce ARC task specification for complex stories (week 1; solves clarity problem)
2. Add approval gate structure to code review (week 2; formalizes existing practice)
3. Use ARC session notes for distributed team handoffs (week 3; solves timezone problem)
4. Structure retro findings with ARC improvement tracking (week 4; makes improvements stick)

---

### 3. KANBAN ⭐⭐⭐⭐ Very High Value (Low Integration Effort)

**Current Structure:**

- Kanban board (columns: To Do, In Progress, Review, Done)
- WIP limits per column
- No ceremonies (optional async standups)
- Continuous flow focus

**ARC Integration Opportunities:**

**A. Board Columns as Approval Gates**

- Traditional Kanban: "In Progress" → "Review" → "Done"
- ARC approach: Each column transition is approval gate

    ```
    Board Workflow with Approval Gates:
    ├─ Backlog → Ready for Work: Product Owner approves priority/context
    ├─ Ready → In Progress: Developer confirms understanding
    ├─ In Progress → Review: Developer mark "ready for review"
    ├─ Review → Testing: Reviewer approves code quality
    ├─ Testing → Ready for Release: QA approves functionality
    └─ Release → Done: Product Owner signs off on acceptance
    ```

- **Why this helps:** Kanban is great at flow but weak on approval clarity; ARC makes approval owners explicit

**B. Living Task Documentation**

- Kanban board is UI; task details live in ticket system
- ARC adds structured task notes in the ticket:

    ```
    Kanban Card: "Implement user login"
    └─ Notes:
       ├─ Task Context: [why this matters, related stories]
       ├─ Technical Details: [API endpoint specs, database schema changes]
       ├─ Acceptance Criteria: [specific tests, edge cases]
       ├─ Related Decisions: [why we chose this approach over alternative]
       └─ Session Notes: [blockers encountered, decisions made during work]
    ```

- **Why this helps:** Card title alone insufficient for context; documented notes reduce context-switching

**C. WIP Limits + Quality Gates**

- Kanban WIP limits prevent overload; ARC approval gates prevent low-quality merges
- Combined effect: sustainable pace with consistent quality

    ```
    Column: In Progress (WIP Limit: 3)
    ├─ Task A: 70% done, no blockers, ready → Review Friday
    ├─ Task B: 50% done, waiting on API spec (blocker documented)
    └─ Task C: 30% done, proceeding normally

    Approval Gate Readiness:
    ├─ Task A: Ready for Review (tests pass, self-review done)
    ├─ Task B: Blocked, escalate API spec dependency
    └─ Task C: Not ready yet
    ```

- **Why this helps:** Visibility into what can move forward; dependencies explicit

**D. Cycle Time + Approval Gate Metrics**

- Kanban already tracks cycle time; ARC adds approval gate metrics

    ```
    Cycle Time Breakdown:
    ├─ Backlog → In Progress: [priority clear? context available?]
    ├─ In Progress → Review: [developer ready to pass to reviewer?]
    ├─ Review Approval Gate: [how long does review take?] ← ARC visibility
    ├─ Testing: [how long does testing take?]
    └─ Done: [how long since merged to production?]
    ```

- **Why this helps:** Identifies slowest approval gate (e.g., code review taking 3 days); optimization opportunity clear

**E. Distributed Kanban Handoffs**

- Kanban async-friendly already (no standup required)
- ARC session handoff protocol + task context docs make async collaboration explicit
- **Why this helps:** Team members async; context preserved; WIP never left hanging

**Value Proposition:** Kanban flow is excellent; ARC adds approval clarity and context documentation without adding
overhead. Very natural fit.

**Adoption Path:**

1. Add approval gate owners to each board column (0 effort; clarifies current practice)
2. Enrich card descriptions with ARC structured notes (week 1; solves context problem)
3. Track approval gate cycle times (week 2; identifies bottlenecks)
4. Use ARC session handoff protocol for async collaboration (ongoing; improves distributed work)

---

### 4. SCRUMBAN ⭐⭐⭐⭐ High Value

**Current Structure:**

- Sprint planning (weekly commitment for planned work)
- Kanban board with WIP limits (ongoing flow for unplanned work)
- Lightweight standups
- Sprint retro (less formal than pure Scrum)

**ARC Integration Opportunities:**

**A. Planned vs. Unplanned Work Tracking**

- Scrumban tracks two categories; ARC provides structure for both:

    ```
    Sprint Container:
    ├─ Planned Track (Sprint commitment):
    │  ├─ Epic/Initiative
    │  └─ Stories (with ARC task structure)
    └─ Unplanned Track (Kanban flow):
       ├─ Urgent bugs
       ├─ Maintenance tasks
       └─ Tech debt items (with ARC task structure)
    ```

- **Why this helps:** Different work types have different approval gates; ARC structure accommodates both

**B. Velocity + Throughput Tracking**

- Scrum tracks velocity (effort-based)
- Kanban tracks throughput (flow-based)
- Scrumban benefits from both; ARC helps measure:

    ```
    Metrics:
    ├─ Planned Track: Velocity (story points completed per sprint)
    ├─ Unplanned Track: Throughput (items completed per week)
    └─ Combined: Cycle time by work type, approval gate delays
    ```

- **Why this helps:** Different work types optimized differently; ARC task structure enables measurement

**C. Sprint Retros + Improvement Backlog**

- Scrumban can use retros to improve both sprint planning and ongoing flow
- ARC structures improvements:

    ```
    Retro Finding: "Unplanned bugs taking too long to fix"
    ├─ Root Cause: No approval gate clarity for urgent bugs
    ├─ Change: Add "Bug Review" approval gate with 4-hour SLA
    ├─ Measurement: Track gate performance weekly
    └─ Review Date: End of next sprint
    ```

- **Why this helps:** Improvements are tracked, tested, and validated

**Value Proposition:** Scrumban tries to get best of both worlds; ARC complements by adding structure to both planned
and unplanned tracks without losing flexibility.

**Adoption Path:**

1. Apply ARC task structure to both sprint stories AND Kanban items (week 1)
2. Define approval gates for planned vs. unplanned work separately (week 1)
3. Track approval gate metrics per work type (week 2)
4. Use metrics to optimize sprint planning and Kanban WIP limits (ongoing)

---

### 5. CONTINUOUS DISCOVERY ⭐⭐⭐⭐ Very High Value

**Current Structure:**

- Weekly product trio (PM, Designer, Engineer) customer interviews
- Testing assumptions via prototypes or MVPs
- Continuous validation without separate "discovery sprint"
- Delivery happens in parallel

**ARC Integration Opportunities:**

**A. Discovery Task Structure**

- Weekly discovery cycle can be formalized with ARC tasks:

    ```
    Discovery Week Work Unit:
    ├─ Task: Customer Discovery Interview
    │  ├─ Objective: Understand user pain with X
    │  ├─ Schedule: 5 interviews planned
    │  ├─ Deliverables: Interview notes, insight summary
    │  └─ Approval: All interviews conducted, synthesis complete
    ├─ Task: Assumption Testing
    │  ├─ Objective: Test if users prefer solution A vs. B
    │  ├─ Deliverables: Prototype, test plan, results
    │  └─ Approval: Product trio reviews validity
    └─ Task: Insight Synthesis
       ├─ Objective: Translate learnings into delivery requirements
       ├─ Deliverables: Feature spec, acceptance criteria
       └─ Approval: Delivery team confirms understanding
    ```

- **Why this helps:** Discovery work often feels unmeasured; ARC structure makes progress visible; approval gates ensure
  quality learning

**B. Discovery → Delivery Handoff**

- Current challenge: learning from discovery not well-communicated to delivery team
- ARC formalizes handoff:

    ```
    Discovery Completion → Delivery Task Creation:
    ├─ Discovery Task: [completed with approval]
    └─ Delivery Task: [created with discovery context]
       ├─ Context: [links to discovery findings]
       ├─ Acceptance Criteria: [from discovery learning]
       ├─ Edge Cases: [discovered during testing]
       └─ Technical Constraints: [engineer feedback from discovery]
    ```

- **Why this helps:** Delivery team starts with validated understanding; avoids building wrong thing

**C. Learning Velocity Tracking**

- Parallel metric to delivery team's story point velocity:

    ```
    Weekly Discovery Metrics:
    ├─ Hypotheses Tested: [count]
    ├─ Insights Generated: [count]
    ├─ Confidence Level: [how confident are we this is right?]
    └─ Pivots Required: [major assumption changes needed?]
    ```

- **Why this helps:** Product team can see learning progress week-to-week; informs delivery planning

**D. Session Continuity Across Discovery Cycles**

- Discovery is research; researcher may change week-to-week
- ARC session handoff captures research context:

    ```
    End of Week Research:
    ├─ Hypotheses Being Tested: [what are we validating?]
    ├─ Participants Lined Up: [who's next, when?]
    ├─ Preliminary Findings: [what we're learning so far]
    ├─ Open Questions: [what still needs investigation]
    └─ Next Week Plan: [what's the priority to test?]
    ```

- **Why this helps:** If researcher unavailable, continuity preserved; momentum maintained

**E. Decision Documentation**

- Discovery generates decisions: "go deeper," "pivot," "move to delivery," "deprioritize"
- ARC structures decision records:

    ```
    Discovery Decision Record:
    ├─ Decision: [what we decided: deliver this feature / test more / reject]
    ├─ Evidence: [what learning led to this decision]
    ├─ Alternatives Considered: [what else we might have done]
    ├─ Confidence Level: [how sure are we?]
    └─ Next Steps: [what happens next based on this decision]
    ```

- **Why this helps:** Decisions have rationale; can be revisited if new learning emerges

**Value Proposition:** Continuous Discovery is about learning continuously; ARC provides structure that validates
learning quality and communicates findings systematically.

**Adoption Path:**

1. Formalize weekly discovery tasks with ARC structure (week 1; adds visibility)
2. Create decision records for discovery outcomes (week 2; captures rationale)
3. Formalize discovery → delivery handoff with ARC transition (week 3; solves communication problem)
4. Track learning metrics parallel to delivery metrics (ongoing; provides portfolio view)

---

### 6. DevOps / SRE ⭐⭐⭐⭐ High Value

**Current Structure:**

- Continuous Integration (automated testing)
- Continuous Deployment (automated release)
- Monitoring & Observability
- Incident Response + Blameless Postmortems
- SLO/SLI targets (SRE specific)
- On-call rotations

**ARC Integration Opportunities:**

**A. Incident Response Approval Gates**

- Incident lifecycle: detection → triage → investigation → resolution → postmortem
- ARC formalizes gates:

    ```
    Incident Response Workflow:
    ├─ Detection Gate: Incident confirmed (not false alarm)
    ├─ Triage Gate: Severity assessed, response team assigned
    ├─ Investigation Gate: Root cause identified with approval
    ├─ Resolution Gate: Fix validated, rollback plan ready
    ├─ Deployment Gate: Change approval (production safety review)
    └─ Postmortem Gate: Learning captured, improvements tracked
    ```

- **Why this helps:** Reduces "who decides what" ambiguity during incidents; ensures proper oversight

**B. SLO/SLI Monitoring + Approval Gates**

- SRE tracks SLI (actual performance) vs. SLO (target)
- ARC structures gate when SLO at risk:

    ```
    SLI Monitoring → Approval Gate Triggered:
    ├─ SLI Achievement: [current performance]
    ├─ Error Budget Burn Rate: [how fast consuming budget]
    ├─ Alert Gate: [requires triage decision]
    ├─ Remediation Gate: [requires approval to reduce feature work]
    └─ Review Gate: [post-incident learning captured]
    ```

- **Why this helps:** SLO decisions have structure; tradeoffs explicit (reliability vs. features)

**C. Deployment Approval Gates**

- Traditional: code merged → deployed automatically
- ARC approach: approval gates between stages:

    ```
    Deployment Pipeline with Gates:
    ├─ Code Merge: Developer approval gate
    ├─ CI Pass: Automated testing approval gate
    ├─ Staging Deploy: QA approval gate
    ├─ Production Approval: SRE/Release Engineer approval gate
    ├─ Deployment: Automated
    └─ Monitoring: Alerting for new issues approval gate
    ```

- **Why this helps:** Clear ownership of each stage; human oversight where it matters; failures traceable

**D. On-Call Handoff Documentation**

- On-call rotation: engineer A → engineer B
- Context loss is major pain point
- ARC session handoff protocol captures:

    ```
    On-Call Handoff:
    ├─ What's Currently Stable: [systems, recent changes, status]
    ├─ What Needs Watching: [metric trends, known issues, dependencies]
    ├─ Recent Incidents: [what happened, what we did, lingering issues]
    ├─ Runbooks Updated: [if any recent changes to procedures]
    └─ Next Scheduled Changes: [what's coming in next 48 hours]
    ```

- **Why this helps:** Reduces "wake them up for context" calls; on-caller confident in handoff

**E. Postmortem to Action Tracking**

- Blameless postmortem generates improvement actions; tracking often poor
- ARC structures action items:

    ```
    Postmortem Action Item:
    ├─ Finding: [what did we learn]
    ├─ Action: [what we'll change]
    ├─ Owner: [who will drive this]
    ├─ Timeline: [by when]
    ├─ Success Measure: [how we'll know it worked]
    └─ Status: [ongoing tracking to completion]
    ```

- **Why this helps:** Actions actually happen; metrics show improvement

**F. Infrastructure Decision Records**

- Infrastructure decisions (new database, service architecture, etc.) often undocumented
- ARC provides structure:

    ```
    Infrastructure Decision Record:
    ├─ Decision: [what we decided to build/change]
    ├─ Rationale: [why this approach vs. alternatives]
    ├─ SLO Impact: [how does this affect reliability targets?]
    ├─ Maintenance Burden: [on-call implications]
    ├─ Rollback Plan: [how we can undo if needed]
    └─ Monitoring: [what metrics confirm it's working]
    ```

- **Why this helps:** New team members understand "why we did it this way"; decisions reversible if needed

**Value Proposition:** DevOps is about automation and visibility; SRE is about reliability. ARC adds governance
structure that DevOps/SRE teams appreciate (clear gates, documented decisions, actionable improvements).

**Adoption Path:**

1. Formalize deployment approval gates (week 1; immediate value for safety)
2. Structure incident response workflow with gates (week 2; solves "who decides" problem)
3. Add SLO decision gates for feature vs. reliability tradeoffs (week 3; enables explicit tradeoffs)
4. Document infrastructure decisions with ARC ADR-style records (week 4; knowledge preservation)
5. Implement on-call handoff protocol (week 5; reduces context-loss incidents)

---

### 7. LEAN (PRINCIPLES) ⭐⭐⭐ Medium Value

**Current Structure:**

- Value focus (eliminate waste)
- Flow emphasis (optimize throughput, reduce handoffs)
- Empowerment (team decides how to deliver)
- Continuous improvement (ongoing optimization)
- Usually layered on Scrum/Kanban rather than standalone

**ARC Integration Opportunities:**

**A. Value Stream Mapping + ARC Task Structure**

- VSM is diagnostic; ARC provides execution structure
- Combine forces:

    ```
    Value Stream: Feature Development
    ├─ Design Phase: [value add: 4 hours, waste: 2 hours delays]
    ├─ Dev Phase: [value add: 8 hours, waste: 1 hour context switching]
    └─ Testing Phase: [value add: 4 hours, waste: 3 hours waiting for QA]

    Improvement Approach (using ARC tasks):
    ├─ Task: Reduce QA Waiting Time
    │  ├─ Current: 3 hours delay (QA busy)
    │  ├─ Improvement: Parallel testing (dev + QA concurrent)
    │  ├─ Implementation: [ARC task structure]
    │  └─ Success: QA delay < 30 min
    ```

- **Why this helps:** VSM identifies waste; ARC structure executes improvements

**B. WIP Limits for Flow Optimization**

- Lean emphasizes "small batches, frequent delivery"
- ARC task structure supports small work items:

    ```
    Traditional Story: "Build user registration"
    └─ 5 story points, 1 week

    ARC Lean Decomposition: "Build user registration"
    ├─ Task 1: Email validation (2 hours, high value)
    ├─ Task 2: Password requirements (1 hour, high value)
    ├─ Task 3: Confirmation email (2 hours, high value)
    ├─ Task 4: Account activation (1.5 hours, medium value)
    └─ Task 5: Error messages (0.5 hours, nice-to-have)

    Lean Approach: Deliver 1-2 tasks per day; get feedback; iterate
    ```

- **Why this helps:** Smaller batches = faster feedback; waste reduction = faster cycle time

**C. Waste Identification + Action Tracking**

- Lean teams constantly identify waste; ARC provides action structure:

    ```
    Waste Finding: "3 hours/week spent in meeting for status updates"
    ├─ Root Cause: Async communication tools not being used
    ├─ Improvement Action: [ARC task structure]
    │  ├─ Objective: Eliminate status update meeting
    │  ├─ Implementation: Structured async status in repo (ARC session notes)
    │  ├─ Success Metric: 3 hours/week freed, zero context loss
    │  └─ Validation: Team confirms improvement
    └─ Follow-up: Track if improvement sticks
    ```

- **Why this helps:** Waste improvements actually happen and stick

**D. Empowerment Through Clarity**

- Lean empowers teams to optimize their own processes
- ARC's transparent task/approval structure enables this:
    - Team sees bottlenecks (where approvals slow down)
    - Team can experiment with approval structures
    - Metrics show if changes help
- **Why this helps:** Team-driven improvement; data-based decisions

**Value Proposition:** Lean focuses on value and flow; ARC adds structure for executing and measuring improvements.
Natural complement, not replacement.

**Adoption Path:**

1. Map current value stream using VSM (week 1; diagnose waste)
2. Identify top 3 waste items; use ARC task structure to track improvements (week 2)
3. Implement WIP limits + ARC task decomposition for smaller batches (week 3)
4. Track improvement metrics; iterate on what works (ongoing)

---

### 8. SHAPE UP ⭐⭐⭐ Medium Value (Natural Fit, Some Tension)

**Current Structure:**

- 6-week cycles (fixed timebox)
- Shaping phase (define problems, not solutions)
- Pitching phase (teams propose how to solve)
- Betting table (leadership decides what to work on)
- Autonomous team execution during cycle

**ARC Integration Opportunities:**

**A. Shaped Project Specification**

- Shape Up's "shaped project" is light; ARC can formalize without over-specifying:

    ```
    Shaped Project: "Login with Email"
    ├─ Problem: Users struggle with password management
    ├─ Solution Direction: Email-based auth with social login option
    ├─ Constraints: Must work on mobile, no new dependencies
    ├─ Rabbit Holes: [avoid: multi-factor auth, identity federation]

    + ARC Enhancement:
    ├─ Technical Constraints: [API design, database schema]
    ├─ Edge Cases: [invalid email, rate limiting, account recovery]
    ├─ Quality Gates: [security review required]
    └─ Integration Points: [systems that need to know about auth]
    ```

- **Why this works:** Shape Up focuses on problem direction; ARC adds technical clarity without over-constraint
- **Why this is tense:** Shape Up philosophy is "trust the team to figure it out"; ARC is "clarity reduces rework"
- **Resolution:** Frame ARC additions as "optional details the team can ignore if they have better ideas"

**B. Cycle Planning with ARC Tasks**

- 6-week cycle can be broken into ARC work units (weekly or by theme):

    ```
    6-Week Cycle: Email Login Feature
    ├─ Week 1-2: Core Implementation (ARC work unit)
    │  ├─ Task 1: Database schema + API endpoint
    │  ├─ Task 2: Frontend email form + validation
    │  └─ Task 3: Email verification flow
    ├─ Week 3: Integration + Edge Cases (ARC work unit)
    │  ├─ Task 1: Social login integration
    │  ├─ Task 2: Account recovery via email
    │  └─ Task 3: Rate limiting + security hardening
    ├─ Week 4-5: Testing + Refinement (ARC work unit)
    │  ├─ Task 1: QA full cycle testing
    │  ├─ Task 2: Performance optimization
    │  └─ Task 3: Cross-browser testing
    └─ Week 6: Launch Prep (ARC work unit)
       ├─ Task 1: Monitoring + alerts setup
       ├─ Task 2: Documentation
       └─ Task 3: Launch runbook + support prep
    ```

- **Why this works:** Shape Up is already well-scoped; ARC provides execution detail without adding meetings
- **Why this is tense:** Shape Up culture is "trust the team"; detailed breakdown feels like micromanagement
- **Resolution:** Frame as optional structure for teams that want it; Shape Up teams who don't want it, don't use it

**C. Betting Table Documentation**

- Betting table is leadership decision point
- ARC can document decision:

    ```
    Betting Table Decision Record:
    ├─ Decision: Approved Email Login feature (6-week cycle)
    ├─ Rationale: High user pain point, competitive advantage
    ├─ Alternatives Considered: Continue with password only, outsource to Auth0
    ├─ Risk Assessment: Engineering estimates feasible, market window tight
    ├─ Success Metrics: [how we'll measure if decision was right]
    └─ Contingency: If social login not ready, launch without it
    ```

- **Why this helps:** Decision rationale preserved; can revisit if needed

**D. End-of-Cycle Reflection**

- Shape Up includes informal "what did we learn?"
- ARC can structure this:

    ```
    Cycle 47 Completion (6-week Email Login):
    ├─ What We Built: [shipped features, actual scope vs. shaped scope]
    ├─ What We Learned: [technical insights, customer feedback, surprises]
    ├─ Team Feedback: [what worked, what hurt, improvements for next cycle]
    ├─ Metrics: [user adoption, performance, quality]
    └─ Lessons for Shaping: [what should shapers know for next similar project]
    ```

- **Why this helps:** Improves future shaping; captures learning

**Value Proposition:** Shape Up is excellent for autonomy and pace. ARC adds optional clarity and learning capture
without adding overhead. Tension is philosophical (prescriptive vs. autonomous); managed by framing ARC as optional.

**Adoption Path:**

1. Document betting table decisions with ARC decision records (week 1; zero impact on execution)
2. Offer ARC cycle breakdown for teams that want more structure (optional; teams decline if it feels constraining)
3. Use ARC end-of-cycle reflection to improve shaping (ongoing; learning accumulation)

---

### 9. SOLO DEVELOPER ⭐⭐⭐⭐⭐ Highest Value, Lowest Barrier

**Current Structure:**

- Self-directed work (no ceremonies, no team)
- Likely using GitHub/Jira or similar for task tracking
- Frequent context switches (support, production issues, new features)
- Context loss between sessions is major pain

**ARC Integration Opportunities:**

**A. Session Continuity (Core Pain Point)**

- Solo dev starting work Monday morning: what was I working on Friday?
- ARC session handoff captures this:

    ```
    Friday End of Session:
    ├─ Completed: [what I finished]
    ├─ In Progress: [what I'm mid-way through]
    ├─ Blockers: [what's waiting on external resources]
    ├─ Current Context: [what I was thinking about]
    │  ├─ Technical decisions made: [why I chose X over Y]
    │  ├─ Uncertain areas: [what I'm still figuring out]
    │  └─ Next steps: [exactly where to pick up]
    └─ Links: [relevant discussions, decisions, related code]

    Monday Morning:
    └─ Read Friday notes → immediate context restoration
    ```

- **Why this matters:** Solo devs lose 30+ minutes/day context recovery; accumulates to 10 hours/week
- **Why ARC is valuable:** Structured notes far faster than scrolling through Slack/GitHub history

**B. Structured Task Execution**

- Solo dev gets interrupted (support issue, production bug, client request)
- ARC task structure helps resume:

    ```
    Main Task: "Build new dashboard feature" (started Tuesday)
    ├─ Objective: [what this feature is for]
    ├─ Progress: [what's done, what's not]
    ├─ Current Implementation: [where I am in the code]
    ├─ Blockers: [what's stopping progress]
    └─ Next Steps: [exactly what to do next]

    Interruption Task: "Fix production bug" (Friday 2pm)
    └─ [Complete, context switch back to main task]

    Resume Main Task: Read current state notes → 2 min context restoration vs. 30 min searching
    ```

- **Why this matters:** Context switches frequent; clear notes reduce friction
- **Why ARC is valuable:** Structured notes are search-engine-friendly, scannable

**C. Approval Workflow as Quality Check**

- Solo dev: "did I do this right?" with no one to ask
- ARC approval gates provide structure:

    ```
    Feature Implementation Approval:
    ├─ Self-Review Gate: "Does code meet my own standards?"
    │  ├─ [Are tests passing?]
    │  ├─ [Does it handle edge cases?]
    │  └─ [Is it maintainable?]
    ├─ Quality Gate: "Is this production-safe?"
    │  ├─ [Are there security issues?]
    │  ├─ [Performance acceptable?]
    │  └─ [Meets accessibility standards?]
    └─ Feature Gate: "Is this what the customer wanted?"
       ├─ [Does it match requirements?]
       └─ [Ready to show customer?]
    ```

- **Why this matters:** No one to catch mistakes; documented checklist prevents oversights
- **Why ARC is valuable:** Gate structure makes implicit checks explicit

**D. Decision Documentation**

- Solo dev makes decisions (architecture, library choice, API design)
- No one to explain to; decision forgotten
- ARC decision records preserve:

    ```
    Decision: Use PostgreSQL instead of MongoDB for data storage
    ├─ Options: PostgreSQL, MongoDB, DynamoDB
    ├─ Chosen: PostgreSQL
    ├─ Reasoning: [relational data, complex queries, compliance requirements]
    ├─ Trade-offs: [higher ops complexity, but better data consistency]
    ├─ Reversibility: [can switch later if requirements change, will be expensive]
    └─ Date: [when this decision was made]

    Value: 6 months later when considering new feature: "Why did we choose Postgres?"
    └─ Answer documented, not lost to memory
    ```

- **Why this matters:** Solo dev is also maintainer; decisions not documented = costly to reverse
- **Why ARC is valuable:** ADR format (Architecture Decision Records) standard for this

**E. Client/Stakeholder Communication**

- Solo dev often works directly with non-technical clients
- ARC structured updates reduce miscommunication:

    ```
    Weekly Status (Client Report):
    ├─ Completed This Week: [feature X, bug fix Y, documentation Z]
    ├─ In Progress: [feature A, estimated completion: date]
    ├─ Blockers: [waiting on client feedback, delayed approval]
    ├─ Next Week Plan: [planned work, if on track]
    └─ Questions for You: [decisions needed from client]
    ```

- **Why this matters:** Clients expect regular updates; ad-hoc communication creates gaps
- **Why ARC is valuable:** Structured format is professional; easy to generate from ARC session notes

**Value Proposition:** Solo devs have no support structure; ARC provides external structure for context preservation,
quality checks, and decision documentation. Massive time savings and confidence boost.

**Adoption Path:**

1. Start session handoff protocol (week 1; immediately reduces context-switch friction)
2. Add approval gates as quality checklist (week 2; prevents mistakes)
3. Document architectural decisions with ADR format (week 3; preserves knowledge)
4. Use session notes for client status updates (ongoing; improves communication)

---

### 10. OTHER METHODOLOGIES (Brief Assessment)

**SAFe (Scaled Agile Framework) — ⭐⭐⭐ Medium Value**

- Already heavily prescribed (8-week PI planning, multiple roles, detailed metrics)
- ARC mostly orthogonal; would be additional layer (higher complexity risk)
- Potential value: improving PI planning documentation, dependency tracking between teams
- Adoption effort: High (SAFe-heavy orgs resistant to additional frameworks)
- **Recommendation:** Position as optional enhancement for existing SAFe teams, not primary target

**Waterfall (Mixed Portfolios) — ⭐⭐⭐ Medium Value**

- Strength: ARC can help with Waterfall's rigidity problem (change management, documentation updates)
- Challenge: Waterfall already heavy on documentation; ARC risks feeling redundant
- Potential value: making requirement changes less painful, decision traceability
- Adoption effort: Medium
- **Recommendation:** Position as "Agile overlay on Waterfall" helping with changeability

**Feature-Driven Development (FDD) — ⭐⭐ Low-Medium Value**

- FDD already feature-centric; less clarity added by ARC
- Potential value: ARC improves FDD's documentation (currently weak)
- Adoption effort: Medium (FDD teams specialized; niche audience)
- **Recommendation:** Niche opportunity; not primary target

**RUP (Rational Unified Process) — ⭐⭐ Low-Medium Value**

- RUP declining; adoption < 2%
- Similar tension to SAFe: already prescribed, ARC feels redundant
- Not recommended as primary target; historical artifact

**Crystal Methods — ⭐⭐⭐ Medium Value**

- Crystal's people-first philosophy aligns with ARC's clarity focus
- Potential value: formalizing "reflective improvement workshops" with ARC structure
- Adoption effort: Low (Crystal teams small, adaptable)
- **Recommendation:** Secondary target; good fit for teams already using Crystal

---

## ADOPTION PRIORITIZATION

Based on combination of adoption % and integration value:

### Tier 1: Highest Priority (Start Here)

1. **Dual-Track / Continuous Discovery** (10-15% adoption, ⭐⭐⭐⭐⭐ fit)
    - Highest value-to-effort ratio
    - Growing market segment
    - Clear pain points ARC solves
    - Recommend: Lead with this audience

2. **Scrum (Distributed Teams)** (30-40% of Scrum teams are distributed)
    - Massive addressable market (majority of teams now distributed)
    - Clear pain point (cross-timezone handoffs)
    - Easy adoption (integrate with existing Scrum)
    - Recommend: Strong secondary focus

3. **Kanban** (56% adoption)
    - Highest adoption of non-Scrum framework
    - Very natural integration (flow + gates)
    - Low barrier to entry
    - Recommend: Parallel primary focus with Scrum

### Tier 2: High Priority (Strong Secondary Focus)

4. **Solo Developer / Freelance** (15-20% of professional devs)
    - Underserved by existing frameworks
    - Clear, acute pain points (context loss)
    - High value-to-effort ratio
    - Recommend: Build specific onboarding for this segment

5. **DevOps / SRE** (95% of teams claim DevOps; 15-20% dedicated SRE)
    - Growing rapidly (SRE up 300% in 5 years)
    - Clear integration points
    - Aligns with reliability focus of modern orgs
    - Recommend: Develop SRE-specific materials

6. **Continuous Delivery / Trunk-Based Development** (30-40% adoption)
    - Part of DevOps; growing segment
    - Clear approval gate integration
    - Part of "high-performing team" playbook
    - Recommend: Integrate with DevOps/SRE materials

### Tier 3: Medium Priority (Watch & Wait)

7. **Scrumban** (27% adoption, ⭐⭐⭐⭐ fit)
    - Growing but slower than Dual-Track
    - Solid fit but less acute pain point
    - Market still accepting Kanban + Scrum separately
    - Recommend: Secondary materials, wait for demand

8. **Shape Up** (< 2% adoption, ⭐⭐⭐ fit)
    - Emerging, growing in product-focused companies
    - Some tension with philosophy (prescriptive vs. autonomous)
    - Early-stage adoption; demand may grow
    - Recommend: Develop materials, market to product teams

9. **Lean Principles** (5% explicit, 40-60% embedded, ⭐⭐⭐ fit)
    - Always layered on something else (Kanban, Scrum)
    - Covered through Kanban/Scrum focus
    - Recommend: Include as overlay in core materials

### Tier 4: Lower Priority (Niche)

10. **FDD, DSDM, RUP, Crystal** (<2% adoption, ⭐-⭐⭐ fit)
    - Niche audiences
    - Specialized requirements
    - Recommend: Document integration points but don't prioritize

11. **SAFe** (44% enterprise adoption, ⭐⭐⭐ fit)
    - Paradox: high adoption but heavy prescriptiveness creates resistance
    - ARC as additional layer = complexity risk
    - Recommend: Document integration for existing SAFe teams, but not primary target

---

## SUMMARY RECOMMENDATIONS

**Lead with:**

1. Dual-Track / Continuous Discovery (highest value, emerging market)
2. Scrum (distributed teams) (largest market, clear pain point)
3. Kanban (very high adoption, easy integration, large market)
4. Solo Developer / Freelance (underserved, high value-to-effort)

**Build strong materials for:** 5. DevOps / SRE (growing rapidly, clear fit)

**Secondary materials for:** 6. Scrumban, Shape Up, Continuous Delivery, Lean principles

**Document but lower priority:** 7. FDD, DSDM, RUP, Crystal, SAFe

**NOT recommended:**

- Methodology-specific frameworks (don't build "ARC for Scrum only")
- Heavy enterprise overlays (SAFe, RUP) as primary targets
- Declining methodologies (RUP, Waterfall-only)

---

## FINAL NOTES

This mapping shows that **ARC has strongest value in async-friendly, distributed, and validation-heavy environments**
(Continuous Discovery, Dual-Track, Solo Dev, Distributed Scrum). It also works well as a **lightweight enhancement to
flow-based frameworks** (Kanban, DevOps, Lean).

ARC's **weakest fit is with already-heavy frameworks** (SAFe, RUP) where additional layering creates complexity.

**Recommend positioning ARC as:** "A lightweight methodology overlay for distributed, async, and validation-heavy
development teams" rather than "enterprise Agile scaling framework" or "single-methodology solution."

This positioning is honest, differentiating, and aligns with where ARC has genuine competitive advantage.

---

**Research Date:** 2026-02-23 **Prepared for:** ARC Framework Integration Planning **Status:** Ready for adoption
strategy development
