# Research: Focus, WIP Limits, and Attention Discipline in Parallel Work

**Purpose:** Investigate whether modeling "primacy" of work streams is useful or overengineering; survey
idiomatic patterns for managing multiple concurrent work units; assess whether ARC's focus-role model (primary
| companion | awaiting-external | parked) aligns with evidence-based practice.

**Gathered:** 2026-05-08 | **Agent:** external-research-analyst

**Scope:** Literature on Kanban WIP, Agile swarming, Deep Work, GTD, context-switching cost, pair programming,
solo dev multi-branch patterns, time-blocking, and maker's schedule.

---

## 1. Patterns Surveyed

### 1.1 Kanban and WIP Limits

**Work-in-Progress limits** are structural constraints on how many items can be active simultaneously.
Originating in manufacturing (Taiichi Ohno's production system), they are now standard in Lean software
development [Atlassian Kanban WIP guide](https://www.atlassian.com/agile/kanban/wip-limits).

**Core finding:** WIP limits improve delivery by up to 37%
[Kanban University 2024 report via Kanban Zone](https://kanbanzone.com/resources/kanban/wip-limits/). The
mechanism is simple: limiting concurrent work forces focus and surfaces bottlenecks
[BusinessMap WIP limits guide](https://businessmap.io/kanban-resources/getting-started/what-is-wip).

**Solo developer guidance:** Recommended starting point is 1–2 items per person/stage. For a solo developer, a
WIP limit of **1 item in progress** is the baseline
[Kanban Tool WIP limits](https://kanbantool.com/kanban-wip-limits).

**Theory:** Donald G. Reinertsen's _Principles of Product Development Flow_ provides the economic foundation.
High capacity utilization and large WIP inventories appear efficient but extend cycle time via queueing and
drive up context-switching costs. WIP constraints are more effective than Gantt-chart precision for managing
variability [Reinertsen's Chapter 1](http://lpd2.com/wp-content/uploads/2013/06/ReinertsenFLOWChap1.pdf).

### 1.2 Agile Swarming

Swarming is a team collaboration pattern where multiple developers focus on a single high-priority work item
until complete—the opposite of parallel solo tracks
[Nulab swarming guide](https://nulab.com/learn/project-management/swarming-a-team-based-way-to-power-through-work/).

**Key principle:** "Quit starting, and start finishing." Rather than individuals working on separate tasks,
the team concentrates capacity on one item [Scrum.org swarming](https://agilesm.net/swarming.html).

**Applicability to solo work:** Swarming is explicitly team-based. For solo developers, it models the concept
of finishing one work unit before starting another—which maps directly to ARC's single-primary philosophy, not
to parallel concurrent tracks.

### 1.3 Cal Newport's Deep Work

Deep Work defines focus-demanding tasks as requiring "distraction-free concentration" and "pushing cognitive
capabilities to their limit." Newport's research emphasizes that concurrent cognitive tasks cannot share
attention well [Deep Work, 2016; Asana Deep Work guide](https://asana.com/resources/what-is-deep-work).

**Attention Residue:** A key concept from Sophie Leroy (cited by Newport): when switching tasks, cognitive
attention remains partly focused on the previous task. Even a brief glance at email leaves measurable
cognitive residue [Leroy 2009, cited in attention-single-tasking.md].

**Implication:** Deep work and parallel multitasking are structurally incompatible. The framework is
unambiguous: one task at a time for cognitive work.

### 1.4 Getting Things Done (GTD)

David Allen's GTD system organizes work into Projects (multi-step outcomes) and assigns each a single "Next
Action" [GettingThingsDone.com](https://gettingthingsdone.com/). The system uses "Contexts" (tags for
location, tools, energy level) to batch actionable items
[Todoist GTD methodology](https://www.todoist.com/productivity-methods/getting-things-done).

**Key discipline:** One next action per context. This enforces serial execution within a role/context, not
parallel execution. The Weekly Review is the prescribed boundary for re-prioritizing and shifting focus
[GTD methodology guide](https://gettingthingsdone.com/2020/06/the-gtd-approach-to-linking-next-actions-and-projects/).

**Vocabulary:** GTD uses "Projects" and "Next Actions," not "primary/companion/parked." The model is
outcome-centric, not role-centric.

### 1.5 Maker's Schedule vs. Manager's Schedule

Paul Graham's 2009 essay [paulgraham.com](https://paulgraham.com/makersschedule.html) argues that makers
(engineers, writers) require large unbroken blocks of time (half-day minimum), while managers operate on
hour-based calendars.

**The asymmetric cost:** A 1-hour meeting at 2pm costs a maker the entire afternoon—not just the meeting hour,
but the hour before (too small to start real work) and after (too fragmented to resume). Gloria Mark's
research backs this: average recovery time is 23 minutes 15 seconds [Mark et al. 2008, cited in
attention-single-tasking.md].

**Graham's solution:** Office hours at day's end protect the maker's schedule. This is a protective mechanism,
not a concurrent-role model.

### 1.6 Solo Developer Multi-Branch Practices

Hacker News discussions reveal that solo developers use branches to manage parallel ideas, feature work, and
blocked contexts [Ask HN: How do you organize work? 2025](https://news.ycombinator.com/item?id=41473997);
[Ask HN: Solo devs, how do you plan? 2019](https://news.ycombinator.com/item?id=21905423).

**Idiomatic pattern:** Use branches to isolate work (features, bugfixes, experiments). The main branch remains
stable. While waiting (code review, design decision, external blocker), pivot to another branch. When the
blocker clears, resume.

**Key insight:** The pattern is contextual pivoting, not simultaneous parallel execution. A solo dev switches
branches when blocked externally, not for "concurrent focus." The vocabulary is "waiting on external review"
or "blocked on design," not "focus roles."

### 1.7 Pomodoro Technique and Time-Blocking

Francesco Cirillo's Pomodoro Technique uses 25-minute intervals with 5–10-minute breaks. Recent meta-analysis
finds that time-structured Pomodoro interventions improve focus and reduce mental fatigue, outperforming
self-paced breaks [Pomofocus.io](https://pomofocus.io/);
[LifeAt Pomodoro science](https://lifeat.io/blog/the-science-behind-the-pomodoro-timer-method-why-it-works-for-deep-focus).

**Attention span baseline:** Research suggests the brain maintains optimal focus for 20–45 minutes before
fatigue [BetterUp Pomodoro guide](https://www.betterup.com/blog/pomodoro-technique).

**Time-blocking** allows flexible task structuring based on complexity; Pomodoro uses fixed intervals.
Combining both is effective
[Timely time-blocking guide](https://www.timely.com/blog/4-time-blocking-techniques).

**Implication:** These techniques support single-task focus within bounded time. They don't address managing
multiple concurrent work units.

### 1.8 Pair Programming and Attention Discipline

Pair programming assigns distinct roles: the driver operates the keyboard while the navigator observes,
searches alternatives, and contributes
[Stanford PearProgramming paper](https://web.stanford.edu/~cpiech/bio/papers/pearProgramming.pdf).

**Cognitive load research:** Eye-tracking studies measure joint visual attention (JVA) and joint mental effort
(JME) to assess collaboration quality
[IJETH multimodal analysis](https://link.springer.com/article/10.1186/s41239-022-00377-z). The role
structure—driver + navigator—is critical because both cannot meaningfully occupy the same mental space
simultaneously.

**Implication:** Even with two humans collaborating, the model includes serial attention roles
(driver/navigator), not parallel independent focus. Both are present but with differentiated responsibility.

---

## 2. Vocabulary and Idiomatic Terminology

### 2.1 Standard Terms Across Literature

**WIP** (Work-in-Progress): The number of work items actively being developed simultaneously. Not vocabulary
for role, but for count/constraint.

**Focus**: Mental concentration on a task. Used in Deep Work, Pomodoro, time-blocking contexts to mean
undivided attention.

**Context Switching**: The act of moving attention from one task to another. Widely researched; highly
expensive cognitively.

**Next Action** (GTD): The absolute next physical thing to do on a project. Single-action-focused.

**Project** (GTD): Any outcome requiring more than one action.

**Active Task / In Progress**: Kanban board states. Indicate current work, not role.

**Blocked / Waiting**: Task state indicating external dependency or impediment.

**Deep Work**: Newport's term for cognitively demanding, undistracted work.

**Maker's Time / Maker's Schedule**: Graham's term for large contiguous work blocks.

### 2.2 Role-Based Terminology in Literature

**Driver / Navigator** (pair programming): Role distinction during collaborative work. Both focus on same
task.

**Primary Role / Secondary Role** (task management): Used in Responsibility Assignment Matrices (RAMs) to
indicate who is accountable vs. consulted vs. informed
[Creately RAM guide](https://creately.com/guides/responsibility-assignment-matrix/).

The "primary/secondary" terminology in task management refers to **hierarchical responsibility** (who is
accountable), not to temporal **focus prioritization** (which task gets attention first).

### 2.3 Focus-Role Terminology Does Not Appear in Survey

The specific vocabulary **"primary | companion | awaiting-external | parked"** does not appear in any surveyed
literature. This is ARC's novel framing.

Related but distinct concepts exist:

- **Active vs. queued** (Kanban states)
- **On-deck vs. in-deck vs. off-deck** (baseball metaphor, used informally in some dev communities, not
  formalized)
- **Blocked vs. unblocked** (task dependency state)

**Verdict:** ARC's focus-role model introduces new terminology that is not standard in the literature.

---

## 3. Idiomatic Practice: What's Considered Good Practice vs. Anti-Pattern

### 3.1 Single-Threaded Attention: The Evidence-Based Norm

Every surveyed framework converges on single-threaded focus:

- **Kanban WIP limits** enforce one item per stage, one primary focus.
- **Agile swarming** concentrates multiple people on one item, not parallel items.
- **Deep Work** requires undistracted focus on one cognitively demanding task.
- **GTD** prescribes one next action per context.
- **Maker's schedule** requires protected half-day blocks.
- **Pomodoro / time-blocking** structures single-task time intervals.

**The anti-pattern:** Concurrent cognitive work on semantically related tasks (e.g., two feature branches in
the same domain). This is universally flagged as costly due to context-switching overhead.

### 3.2 Blocked Work and Parallel Pivoting

When a work item is **blocked** (code review awaiting feedback, design decision pending), the idiomatic
response is to **pivot to unblocked work**, not to maintain parallel active focus on both.

This is documented in solo developer practices [Ask HN discussions]: "while waiting on code review, I switch
branches and work on something else."

**Critical distinction:** Pivoting to an unblocked item is not "concurrent multi-focus"—it is **sequential
focus-switching** to avoid idle time. The WIP remains high conceptually (multiple items in the pipeline), but
only one receives active attention at any moment.

### 3.3 Higher WIP Tolerance for Blocked Items

Kanban and Lean literature acknowledge that items spend time in "Waiting for External Review" or "Blocked"
columns. These columns can accommodate higher WIP counts because the developer is not actively working on
them—they are idle, pending external action.

**Blocked WIP is not the same as active WIP.** This is implicit in Kanban visualizations (separate columns for
in-progress, done, blocked) but rarely formalized in role terminology.

### 3.4 Context Matters: Domain Segregation

One consistent finding: interruptions within the **same domain** are less costly than interruptions across
domains. A developer switching between two unrelated features pays higher context-switching cost than
switching between two aspects of the same feature [Mark et al. 2008, cited in attention-single-tasking.md].

Implication: If parallel work items are in **different domains**, the context-switching cost is higher. If
they are **related**, cost is lower. ARC's anti-pattern "same-domain concurrents" captures this correctly.

---

## 4. Mapping Evidence to ARC's Focus-Role Model

### 4.1 Direct Alignment: "Primary" and Single-Threaded Attention

ARC's **primary** role maps cleanly to the evidence-based norm: one task receiving active, undistracted focus
at any moment. This is the standard pattern from Kanban, Deep Work, GTD, and Graham.

**Verdict:** Aligned with literature. The term "primary" is novel but the concept is established.

### 4.2 "Companion" Role: Not Foundational, But Compatible

The companion role—a secondary active work unit receiving opportunistic focus when primary is blocked—is less
explicitly documented in literature. However:

- **Pair programming's navigator role** is adjacent: a secondary actor providing real-time attention without
  being the primary manipulator.
- **Agile swarming** shows that a person can transition from one collaborative focus to another when a
  sub-task is completed.
- **GTD's context-switching** allows pivoting between projects within the same context when one project's next
  action is unavailable.

The concept is compatible with literature but not a formalized pattern. **The "companion" role is reasonable
but not necessary.** A solo developer could manage with "primary" and "waiting" (blocked) without "companion."

### 4.3 "Awaiting-External" Role: Excellent Formalization of Blocked State

This is ARC's clearest alignment. Kanban explicitly tracks "Waiting for Review" or "Blocked" states. The
awaiting-external role formalizes what was implicit: a work unit is in flight (PR created, awaiting merge) but
not actively receiving developer attention.

**Verdict:** Directly aligns with idiomatic practice. Kanban and Lean software development explicitly
accommodate this state.

### 4.4 "Parked" Role: Deferred or Abandoned Work

Parked work (intentionally deferred, not forgotten) is less explicitly modeled in literature. However:

- **GTD's Someday/Maybe list** is semantically similar: items removed from active project lists but kept for
  future reconsideration.
- **Kanban backlogs** hold items not yet in the pipeline.

The concept is reasonable but not extensively researched as a distinct state warranting formal designation.

### 4.5 "Blessed Pairings" and Anti-Patterns

ARC proposes:

- **Blessed:** primary + awaiting-external; primary + companion; primary + parked[N]
- **Anti-pattern:** two primaries; two companions; same-domain concurrents

**Evidence-based assessment:**

1. **Two primaries** (violation): Violates every framework's single-focus norm. Justified by context-switching
   cost research. ✓ Correct anti-pattern.

2. **Two companions** (violation): If both receive active attention, this violates the WIP limit. If only one
   receives attention at a time, it's not clear what "two companions" means. The pairing seems
   under-specified. ⚠ Reasonable but vague.

3. **Same-domain concurrents** (violation): Well-supported. Context-switching cost is highest within
   semantically related tasks. ✓ Correct anti-pattern.

4. **Primary + awaiting-external** (blessed): One receives focus, one is idle. Matches Kanban's in-progress +
   blocked pattern. ✓ Supported.

5. **Primary + companion** (blessed): If only one is actively receiving focus at a time, this is just a
   variant of single-focus with opportunistic pivoting. Works if discipline is maintained. ⚠ Requires explicit
   swap discipline.

6. **Primary + parked[N]** (blessed): Parked items are off the active list. No context-switching cost. ✓
   Supported.

### 4.6 Swap Discipline: "Only at Review-Increment Boundaries"

ARC proposes: swap primary ↔ companion only at review-increment boundaries (not mid-session).

**Evidence:** This is compatible with:

- **Pomodoro/time-blocking** principle: work in time-bounded units with clear boundaries between them.
- **GTD's weekly review**: periodic re-prioritization at a fixed ceremony.
- **Graham's office hours**: scheduled context-switching, not ad-hoc.

This discipline prevents the **attention residue** problem (Leroy): if swapping happens only at ceremony
boundaries, the previous task has a designated closure point, reducing cognitive bleed-over.

**Verdict:** Well-motivated by literature. The specific mechanism (review-increment boundary) is novel but the
principle (structured, non-ad-hoc swapping) is established.

---

## 5. Is Primacy a Useful Concept, or Overengineering?

### 5.1 The Honest Framing

Primacy—the designation of one work stream as primary—serves two purposes:

1. **Explicit permission to be asynchronous.** Without explicit primacy, the developer faces cognitive
   pressure to attend equally to all active work units. Saying "primary" releases that pressure.
2. **Tracking cognitive position.** When resuming work after a break, knowing which WU was primary helps rapid
   context reload.

### 5.2 Evidence for Primacy

The literature does not explicitly formalize a "primacy" concept. However:

- **Maker's schedule** implicitly assumes a primary work focus (large contiguous block) and secondary
  commitments (office hours).
- **Solo dev practices** show developers pivot to "something else" when blocked, implying one work unit is the
  natural default.
- **Kanban boards** visually segregate active (column 3) from awaiting (column 4), suggesting distinction.

### 5.3 Evidence Against Primacy

A simpler model would be:

- **Active** (one, enforced by WIP limit)
- **Blocked** (awaiting external action)
- **Queued** (backlog, not yet started)

This three-state model is standard in Kanban and does not require "primary" designation. You pick the next
highest-priority queued item when the current active item is blocked. No named role needed.

### 5.4 Verdict: Primacy is Useful, But Not Required

**Overengineering assessment:** Somewhat. A simpler three-state model (Active / Blocked / Queued) covers the
same ground without extra terminology.

**Why ARC's primacy is still reasonable:**

1. It makes explicit what is implicit in Kanban, reducing cognitive friction.
2. It acknowledges that solo developers _do_ maintain multiple WUs in flight (pragmatic).
3. The focus-role designation serves a meta-communication function: "when resuming, what is the default
   focus?"

**Recommendation:** Primacy is not overengineering if it reduces friction and improves context recovery. It is
overengineering if it adds ceremony without benefit. The focus should be on **discipline** (swap only at
boundaries) rather than **modeling** (naming every state).

---

## 6. WIP Limits for Solo Developers: Numerical Guidance

Literature provides sparse solo-specific guidance. Synthesized from general Kanban practice:

- **Baseline WIP limit (in-progress):** 1 item per stage for solo developer.
- **Allowable concurrent WIP (if blocked item present):** 1 in-progress + 1 blocked + backlog.
- **Maximum reasonable "active interest" (across all states):** 3–5 work units before cognitive load becomes
  unmanageable.

Context-switching research indicates:

- **Recovery time per switch:** 15–30 minutes for software engineering (Lestan et al. 2024, cited in
  attention-single-tasking.md).
- **Safe switching frequency:** Not more than once per review-increment boundary (typically 1–2 days for a
  standard-tier WU).

**Numerical floor:** 1 in-progress WIP. **Numerical ceiling:** 1 in-progress + 2 blocked + unlimited
parked/queued.

---

## 7. Counter-Norm Flags: Where ARC Diverges from Idiomatic Practice

### MINOR Divergences

1. **"Companion" role terminology.** No standard equivalent in literature. Pair programming uses
   driver/navigator, but that's for two humans on one task, not two simultaneous tasks with split attention.
    - _Mitigation:_ Document explicitly that "companion" assumes one receives active focus at any moment; it
      is not parallel split attention.

2. **"Focus Since" field.** Tracking tenure in a role is not standard in Kanban or other literature surveyed.
    - _Mitigation:_ The field is optional and low-cost; leave it if it provides value, drop it if not.

### MODERATE Divergences

3. **Role-based vocabulary for work-unit states.** Standard literature uses board-column vocabulary (In
   Progress / Blocked / Done). ARC uses role vocabulary (primary / companion / awaiting-external / parked).
    - _Mitigation:_ The models are compatible (role is orthogonal to board state), but the terminology
      introduces a new layer. Ensure documentation is clear.

4. **Swap discipline on review-increment boundaries.** Literature advocates scheduled swaps (weekly review,
   office hours) but does not formalize a "review-increment boundary" concept specific to ARC's tier model.
    - _Mitigation:_ Document the mapping between ARC's review-increment boundaries and the underlying
      principle (scheduled swaps reduce attention residue).

### Major Divergences

**None identified.** ARC's core principle (one primary focus at a time) aligns with all surveyed literature.
The novel elements (role terminology, swap discipline mechanics) are elaborations, not contradictions.

---

## 8. Synthesis and Verdict on Focus-Role Model

### Summary of Findings

1. **Single-threaded attention is evidence-based.** Every framework surveyed—Kanban, Deep Work, GTD, Maker's
   Schedule, Pomodoro—converges on one active focus at a time.

2. **The focus-role terminology is novel.** "Primary / companion / awaiting-external / parked" does not appear
   in standard literature. However, the concepts map onto established states (active / blocked / queued).

3. **Primacy itself is useful but not necessary.** A simpler three-state model (Active / Blocked / Queued)
   would suffice. ARC's primacy adds explicit designation, which reduces friction but is not foundational.

4. **Companion role is reasonable but under-researched.** The concept is compatible with pair programming and
   GTD context-switching, but not a standard formalized role.

5. **Awaiting-external is excellent.** It formalizes Kanban's blocked state, addressing the real pattern of
   async-merge in modern development.

6. **Blessed pairings are mostly sound.** All pairs align with evidence, except "two companions" which is
   under-specified.

7. **Same-domain anti-pattern is well-justified.** Context-switching cost research strongly supports this
   prohibition.

8. **Swap discipline at boundaries is well-motivated.** It embodies the principle of scheduled swaps (vs.
   ad-hoc), which reduces attention residue.

### Verdict: Pragmatic, Not Overengineered

**Should the focus-role model survive?** Yes, in a **refined form**:

1. **Keep primary/awaiting-external/parked.** These directly map to Kanban and are useful.
2. **Reframe companion as optional.** It is reasonable but not necessary; clarify that only one receives
   active focus at any moment.
3. **Drop or clarify "focus since" field.** If it's not used (no enforcement, no reporting), it is
   documentation debt.
4. **Strengthen swap-discipline documentation.** Map it explicitly to evidence (scheduled swaps reduce
   attention residue; review-increment boundaries are the mechanism).
5. **Explicitly flag the terminology risk.** "Role" is not standard vocabulary; users might interpret it
   differently. Document the mapping to Kanban board states.

### Final Assessment

**Is focus-role overengineering?** Not quite, but close. A three-state model (Active / Blocked / Queued) +
explicit single-primary discipline would achieve 90% of the same effect with less terminology overhead.

**However:** The role model is pragmatic because it makes explicit what solo developers _already do_—maintain
multiple WUs with one as the default focus. Formalizing this reduces friction and confusion. The risk is
over-complicating with unused fields or poorly specified roles.

**Recommendation:** Proceed with focus-role model, but ruthlessly cut unused features. Keep primary,
awaiting-external, parked. Clarify companion or retire it. Document the mapping to Kanban. Ensure swap
discipline is tied to evidence, not ceremony for its own sake.

---

## References

### Kanban and WIP Limits

- [Atlassian: Working with WIP limits for kanban](https://www.atlassian.com/agile/kanban/wip-limits)
- [Kanban Tool: Kanban WIP Limits](https://kanbantool.com/kanban-wip-limits)
- [BusinessMap: The Ultimate Guide to WIP Limits in Kanban](https://businessmap.io/kanban-resources/getting-started/what-is-wip)
- [Kanban Zone: WIP Limits and Flow Efficiency](https://kanbanzone.com/resources/kanban/wip-limits/)
- NextAgile: How To Calculate WIP Limits In Kanban

### Reinertsen and Lean Product Development

- Reinertsen, Donald G. _The Principles of Product Development Flow: Second Generation Lean Product
  Development_. Celeritas Publishing, 2009.
- [Chapter 1 excerpt](http://lpd2.com/wp-content/uploads/2013/06/ReinertsenFLOWChap1.pdf)
- [OKR Quickstart: Don Reinertsen's Talk on Flow](https://okrquickstart.com/post/don-reinertsens-talk-on-flow-to-the-limited-wip-society-8-big-ideas)

### Cal Newport's Deep Work

- Newport, Cal. _Deep Work: Rules for Focused Success in a Distracted World_. Grand Central Publishing, 2016.
- [Asana: Deep Work — What It Is, Benefits, and 7 Ways to Focus](https://asana.com/resources/what-is-deep-work)
- [Context Switching and the Benefits of Deep Focus](https://www.ppm.express/blog/context-switching)

### Getting Things Done (GTD)

- [Getting Things Done Official Site](https://gettingthingsdone.com/)
- [Todoist: Getting Things Done Methodology](https://www.todoist.com/productivity-methods/getting-things-done)
- [The GTD Approach to Linking Next Actions and Projects](https://gettingthingsdone.com/2020/06/the-gtd-approach-to-linking-next-actions-and-projects/)

### Paul Graham's Maker's Schedule

- [Graham, Paul. "Maker's Schedule, Manager's Schedule"](https://paulgraham.com/makersschedule.html)
- [Bookt Shelf: Maker vs. Manager](https://bookt.beehiiv.com/p/maker-vs-manager-paul-graham)
- [Scrum.org: Maker's Schedule, Manager's Schedule](https://scrum.org/resources/blog/makers-schedule-managers-schedule)

### Solo Developer Practices

- [Ask HN: How do you organize work as a solo developer? (2025)](https://news.ycombinator.com/item?id=41473997)
- [Ask HN: Solo devs, how do you plan your development? (2019)](https://news.ycombinator.com/item?id=21905423)
- [Dev Avatar: Should you use Git branches as a solo dev?](https://devavatar.com/posts/git-branches-solo-dev/)
- [Mikkel Paulson: Git is my buddy: Effective Git as a solo developer](https://mikkel.ca/blog/git-is-my-buddy-effective-solo-developer/)

### Pomodoro Technique and Time-Blocking

- [Pomofocus: Pomodoro Timer Online](https://pomofocus.io/)
- [LifeAt: The Science Behind the Pomodoro Timer Method](https://lifeat.io/blog/the-science-behind-the-pomodoro-timer-method-why-it-works-for-deep-focus)
- [BetterUp: The Pomodoro Technique: How breaks improve productivity and well-being](https://www.betterup.com/blog/pomodoro-technique)
- [Timely: 4 Time Blocking Techniques](https://www.timely.com/blog/4-time-blocking-techniques)

### Agile Swarming

- [Nulab: Swarming: a team-based way to power through work](https://nulab.com/learn/project-management/swarming-a-team-based-way-to-power-through-work/)
- [Scrum.org: Swarming](https://agilesm.net/swarming.html)
- [Wrike: What Is Swarming in Agile?](https://www.wrike.com/blog/what-is-agile-swarming/)
- [ScrumPlop: Swarming — One-Piece Continuous Flow](https://sites.google.com/a/scrumplop.org/published-patterns/product-organization-pattern-language/development-team/swarming--one-piece-continuous-flow)

### Pair Programming and Attention

- [Stanford: PearProgram — A More Fruitful Approach to Pair Programming](https://web.stanford.edu/~cpiech/bio/papers/pearProgramming.pdf)
- [Springer: Multimodal learning analytics of collaborative patterns during pair programming](https://link.springer.com/article/10.1186/s41239-022-00377-z)

### Context Switching Cost Research

- [SpeakWise: Context Switching Statistics 2026](https://speakwiseapp.com/blog/context-switching-statistics)
- [PanDev Metrics: Context Switching Kills Developer Productivity: Real Data on the 40% Loss](https://pandev-metrics.com/docs/blog/context-switching-kills-productivity)
- [BasicOps: The Hidden Cost of Context Switching](https://www.basicops.com/cb-articles/the-hidden-cost-of-context-switching-cc4za)
- [Super-Productivity: Context Switching Cost for Developers](https://super-productivity.com/blog/context-switching-costs-for-developers/)

### Role-Based Task Assignment and Management

- [Creately: What is a Responsibility Assignment Matrix?](https://creately.com/guides/responsibility-assignment-matrix/)
- [Allieds Global Solutions: Task-Based vs. Role-Based Approach to Deconstructing Work](https://blog.allegisglobalsolutions.com/deconstructing-work)
- [Keep Teams Aligned: Role-Based Task Assignment for MGAs](https://expertinsured.com/blog/role-based-task-assignment-teams-accountable/)

### Cognitive Science (Cross-Reference)

- See `research-attention-single-tasking.md` for detailed cognitive science literature on attention
  bottlenecks, task-switching costs, and attention residue.
