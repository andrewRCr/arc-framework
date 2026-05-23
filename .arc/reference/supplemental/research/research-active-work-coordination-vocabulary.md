# Research: Active Work Coordination Vocabulary

**Date:** 2026-05-08  
**Scope:** PM tools, open-source project conventions, productivity tools, developer-focused coordination
patterns  
**Status:** Complete — ready for decision frame

---

## Executive Summary

Real-world PM tools converge on a simple vocabulary: **To Do → In Progress → In Review/Done**, with optional
**Blocked/Waiting** states to surface idle work. No tool surveyed uses "primary / companion /
awaiting-external / parked" role annotation. Kubernetes (lifecycle/active), Linear, Jira, Shortcut, GitHub
Projects, and Notion all distinguish active work via explicit status fields, not role designation. The closest
analogue to ARC's "awaiting-external" is an explicit "In Review" or "Waiting for Review" status, distinct from
"In Progress." Single-assignee discipline is idiomatic across all platforms surveyed. ARC's focus-role
vocabulary is **net-new terminology with no industry precedent**, which is a MODERATE risk for adopter
comprehension—the concepts are sound, but the labels will require careful introduction and documentation.

---

## Patterns Surveyed

### Status Field Vocabularies Across Platforms

#### Linear

[Linear Docs — Issue status](https://linear.app/docs/configuring-workflows)

Default workflow: **Backlog → Todo → In Progress → Done → Canceled**. The In Progress status is core; users
can customize this workflow, but the sequential pipeline is the canonical pattern. No "companion" or "role"
designation exists; work is either in one state or another.

#### Jira

[Atlassian — Workflow and statuses](https://support.atlassian.com/jira-cloud-administration/docs/work-with-issue-workflows/),
[10 Jira Status Anti-Patterns](https://community.atlassian.com/forums/App-Central-articles/10-Jira-Status-Anti-Patterns-and-the-10-Minute-Fi/ba-p/3138593)

Jira enforces three status categories:

- **To Do** — backlog items
- **In Progress** — active work (idiomatic: split into "In Dev" + "Code Review" for clarity)
- **Done** — completed work

Anti-pattern guidance explicitly recommends adding **Blocked/On Hold** status to surface stalled work separate
from active work. "In Review" is a distinct status often used when work awaits code review, keeping review
queues visible.

#### Shortcut (formerly Clubhouse)

[Shortcut Help — Managing Workflow States](https://help.shortcut.com/hc/en-us/articles/205268889-Managing-Your-Workflow-States)

Default workflow: **Backlog → Unstarted → Started → Done**. The Started state is grouped with Backlog and
Unstarted into workflow state types. "Active development" is a collection of projects, not a role annotation
on individual work units.

#### GitHub Projects

[GitHub Docs — Customizing board layout](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-board-layout)

Kanban-style status columns: **To Do → In Progress → Done** (customizable). Users can define additional
columns for "In Review" as a distinct status. Status field is the canonical way to indicate where work stands;
there is no "primary" vs "companion" distinction.

#### Asana

Limited official documentation on status enum. Community usage shows standard **To Do → In Progress → Done**
progression. "My Tasks" list allows manual prioritization but does not provide a machine-readable "currently
working on" designation separate from assignee.

#### Notion

[Notion — Status property](https://www.notion.com/help/guides/status-property-gives-clarity-on-tasks)

Default categories: **To Do → In Progress → Complete**. Customizable with sub-categories. Optional fields like
Priority and Person (assignee) can be combined with Status, but there is no built-in "focus role" or "primary"
designation.

#### Trello

[Trello — Custom Fields and Workflows](https://support.atlassian.com/trello/docs/working-with-custom-fields/)

Status is column-based: **Backlog → Prioritized Queue → Doing → Blocked → Done** (customizable). Custom fields
can add Priority, Effort, and Due Date; workflow is explicit via board columns, not role annotation.

#### Height

[Height Help — Task status](https://help.height.app/en/articles/3606831-height-overview)

Default kanban: **To Do → In Progress → In Review → Done**. The In Review status is first-class, not a
compound designation. Smart lists allow filtering by status, assignee, sprint, but no role-based "focus"
annotation.

#### Basecamp

No public documentation on explicit status field. Tool is oriented toward todo-list and messaging model rather
than workflow state tracking. No evidence of status enum or "active work" designation beyond implicit
completion markers.

### Open-Source Project Conventions

#### Kubernetes

[Kubernetes Issue Triage Guidelines](https://www.kubernetes.dev/docs/guide/issue-triage/)

Uses GitHub labels for triage workflow:

- **lifecycle/active** — issues actively being worked on (auto-labeled when assigned)
- **priority/critical-urgent**, **priority/important-soon**, **priority/awaiting-more-evidence** — priority
  levels
- **triage/accepted** — ready to be actively worked on
- **triage/needs-information** — blocked pending response

The lifecycle/active label indicates active status; no role annotation. Prioritization is orthogonal to active
status.

#### Django

[Django Contributing](https://docs.djangoproject.com/en/stable/contributing/)

No explicit documented triage workflow; standard GitHub issue conventions apply. Status is implicit: open
issues → assigned → closed on merge.

#### Rust RFC Process

[Rust RFC Book — 0002-rfc-process](https://rust-lang.github.io/rfcs/0002-rfc-process.html)

RFC lifecycle:

- **Discussion** — pull request open, seeking feedback and consensus
- **Final Comment Period (FCP)** — 10 calendar days, all subteam sign-off required
- **Active** — RFC merged; authors may now implement
- **Implementation** — work in progress toward inclusion in Rust

"Active" is a binary state (merged), not a role designation. Each RFC has an associated implementation issue
in the Rust repo, which may be assigned a priority label via triage.

### Productivity and Personal Task Tools

#### Things 3

[Things 3 Features](https://culturedcode.com/things/features/)

The **Today** list highlights tasks scheduled or due today. You can manually add items to Today to prioritize
immediate attention. No explicit "focus role" field; focus is achieved via manual list assignment and due-date
filtering.

#### OmniFocus

[OmniFocus Features](https://www.omnigroup.com/omnifocus/features/),
[Colter Reed — Tracking Urgent and Important Tasks](https://colterreed.com/tracking-urgent-and-important-tasks-in-omnifocus/)

The **Flagged** status marks items of importance; Flagged items appear in the Flagged perspective and
alongside due items in Forecast. A perspective can filter by "Due or Flagged" to surface immediate priorities.
Flagged is a boolean marker, not a role annotation. No "companion" or "parked" concept; focus is achieved
through filtering.

#### Notion Personal Databases

[Notion — Task databases](https://www.notion.com/help/guides/give-your-to-dos-a-home-with-task-databases)

Standard template: Status (To Do / In Progress / Complete), Assignee, Priority, Due Date. Users can combine
Status with Priority to surface "high priority + in progress," but there is no built-in "focus role" field.
Custom properties can be added, but focus is achieved via query/filtering, not annotation.

---

## Vocabulary Summary

| Concept                 | Linear      | Jira        | GitHub Projects | Shortcut   | Notion      | Kubernetes         | OmniFocus  |
| ----------------------- | ----------- | ----------- | --------------- | ---------- | ----------- | ------------------ | ---------- |
| **Active work status**  | In Progress | In Progress | In Progress     | Started    | In Progress | lifecycle/active   | Flagged    |
| **Awaiting review**     | (custom)    | In Review   | (custom)        | (custom)   | (custom)    | (label)            | (implicit) |
| **Blocked/stalled**     | (custom)    | Blocked     | (custom)        | (custom)   | (custom)    | triage/needs-info  | (implicit) |
| **Priority layer**      | (separate)  | (separate)  | (separate)      | (separate) | (separate)  | priority/\* labels | (implicit) |
| **Focus role**          | ❌ None     | ❌ None     | ❌ None         | ❌ None    | ❌ None     | ❌ None            | ❌ None    |
| **Primary / Companion** | ❌ None     | ❌ None     | ❌ None         | ❌ None    | ❌ None     | ❌ None            | ❌ None    |
| **Parked / Deferred**   | (custom)    | (custom)    | (custom)        | (custom)   | (custom)    | (label)            | Deferred   |

**Key observation:** Every platform surveyed models active work via a **status field (one-per-issue)**, not
via role annotation. Status is orthogonal to priority, assignee, and due date. No tool uses "primary,"
"companion," or "parked" as role designations for the developer's own work.

---

## Idiomatic Patterns

### Single-Assignee Discipline

[Productive.io — One Task, One Assignee: Apple's Approach](https://productive.io/blog/one-task-one-assignee-apple-method/),
[Quire — Time to Break the Myth of "Multiple Assignees"](https://quire.io/blog/p/Time-to-break-the-myth-of-Multiple-Assignees-in-Task-Management.html)

**Idiomatic across all surveyed platforms:** A task has one assignee (the Directly Responsible Individual, or
DRI). Multiple people may contribute via subtasks or comments, but ownership is singular. This pattern is
enforced by structure, not convention: most PM tools allow only one assignee per issue/card.

**Exception:** Approval workflows sometimes require multiple reviewers to mark completion; in these cases, the
primary assignee stays on the issue, and reviewers are tracked separately (via review request or "waiting on"
relationship).

### "Awaiting Review" Composition

Standard idiomatic pattern: A developer has work **In Progress** and separately ships a PR. Once the PR is
opened, the issue moves to **In Review** (or remains In Progress with a related PR link). The developer can
simultaneously start the next work item.

[Jira Anti-Patterns guide](https://community.atlassian.com/forums/App-Central-articles/10-Jira-Status-Anti-Patterns-and-the-10-Minute-Fi/ba-p/3138593)
explicitly recommends splitting "In Dev" + "Code Review" statuses to make review queues visible.

**Status composition, not role composition:** The awaiting-review state is captured by status transition (In
Progress → In Review), not by a role annotation.

### WIP Limits and Parallel Work

[Atlassian — WIP Limits](https://www.atlassian.com/agile/kanban/wip-limits),
[DORA — Work in process limits](https://dora.dev/capabilities/wip-limits/)

**Idiomatic principle:** Limit active work to one task per person at a time. Teams set WIP limits slightly
below capacity (e.g., team size × 1.5 for the team's In Progress column). The goal is to "stop starting, start
finishing," not to mandate single-threaded solo work.

**Within ARC's context:** WIP limits apply at the kanban board level (number of items in In Progress), not at
the per-developer focus-role level. ARC's focus-role model is finer-grained (which of _my_ WUs is primary)
whereas WIP limits are coarser-grained (how many issues is the whole team working on).

### Blocked/Waiting as Explicit Status

[Jira anti-patterns](https://community.atlassian.com/forums/App-Central-articles/10-Jira-Status-Anti-Patterns-and-the-10-Minute-Fi/ba-p/3138593)
recommend adding **Blocked** or **On Hold** status to surface stalled work separately from active work. This
prevents "stuck work" from hiding inside "In Progress," improving cycle-time metrics.

**Idiomatic:** Blocked/Waiting is a first-class status, not a metadata field. Work explicitly transitions out
of In Progress into Blocked when a blocker arises.

---

## Mapping to ARC's Focus-Role Model

### Does "primary / companion / awaiting-external / parked" Exist Anywhere?

**Answer: No.** Zero tools or methodologies surveyed use this exact vocabulary or conceptual structure. The
closest patterns are:

1. **"awaiting-external" ↔ "In Review" status:** Distinct, first-class status indicating work shipped but
   awaiting external action (review/approval/merge). Standard across all PM tools.
2. **"primary" ↔ implicit via assignee + In Progress status:** No tool reifies "primary" as a separate
   annotation. Primary is implicit: you are assigned to it and it's In Progress.
3. **"companion" ↔ None found.** No tool models a second-tier concurrent work unit. Either work is active (In
   Progress) or it's not.
4. **"parked" ↔ Custom "On Hold" status or backlog demotion:** Some teams use a custom On Hold status; more
   commonly, parked work returns to the backlog.

### "This is the work I'm focused on right now"

**Real-world pattern:** PM tools don't reify this. Focus emerges from:

- **Assignee + Status:** If you're assigned and it's In Progress, you're working on it.
- **Priority filtering:** Things 3, OmniFocus, and Notion allow users to manually highlight Today/Flagged
  items for immediate focus.
- **Implicit via notifications:** Linear and GitHub flag items awaiting your action (PR reviews, assigned
  issues).

No tool provides a first-class "my current focus" field distinct from assignee + status + priority. Personal
productivity tools (Things 3, OmniFocus) use **Today/Flagged lists** for this; team tools rely on status.

### Single-Active-Assignee as Idiomatic Constraint

**Answer: Yes, enforced structurally.** All surveyed PM tools enforce one assignee per issue. This is
idiomatic and not controversial. ARC's "one primary WU at a time per developer" maps cleanly to this pattern.

### Handling "Awaiting Review While Starting Next Work"

**Idiomatic composition:**

- **Status transition:** Issue moves In Progress → In Review (or stays In Progress with linked PR).
- **Parallel WU start:** Developer assigns self to next issue, moves it to In Progress.
- **No role annotation needed:** Status + assignee already express the state.

The anti-pattern flagged in
[Jira documentation](https://community.atlassian.com/forums/App-Central-articles/10-Jira-Status-Anti-Patterns-and-the-10-Minute-Fi/ba-p/3138593)
is lumping review work under "In Progress" without a distinct "In Review" status. The fix is status
discipline, not role annotation.

### Closest Existing Pattern to ARC's Focus-Role Model

**Answer: Jira's distinction of In Dev + Code Review as separate statuses.** This captures the idea that a
developer can be "working on implementation" (In Dev) while simultaneously shepherding a prior PR (Code
Review). But this is still **status-based**, not role-based.

The next-closest is Kubernetes' **lifecycle/active label** (indicating active assignment) separate from
**priority/\* labels** (indicating urgency). This is orthogonal annotation, not role designation.

**Verdict:** ARC's focus-role model is genuinely novel. It introduces a new semantic layer not present in
standard PM tooling.

---

## Counter-Norm Flags

### MODERATE: New Vocabulary Risk

ARC introduces `primary | companion | awaiting-external | parked` as first-class focus-role terminology. This
vocabulary has **zero precedent** in surveyed industry practice. Adopters familiar with Linear, Jira, or
GitHub Projects will not have a mental model for "companion work" or "focus role."

**Mitigation required:**

- Explicit glossary in strategy-concurrent-work.md linking focus roles to idiomatic status equivalents.
- Examples using parallel Jira/Linear/GitHub vocabulary to ease recognition.
- Clear statement: "focus roles annotate _developer intent_ about which WU is primary; status fields annotate
  _work position in workflow_. These are orthogonal layers."

**Risk level: MODERATE.** The concepts are sound and useful; the terminology will require explanation.

### MINOR: "Companion" Has No Real-World Referent

No surveyed tool or methodology models "companion work" as a distinct concept. Developers simply have multiple
assigned issues at different statuses. The semantic category "work I've started but deprioritized in favor of
primary" is real, but unnamed in industry practice.

**Potential confusion:** "If my issue is In Progress, is it primary or companion?" (Answer: focus role answers
this; status does not.)

**Mitigation:** Clearly separate the two concepts in documentation. "Status = where in the workflow. Focus
role = my prioritization intention."

**Risk level: MINOR.** Clarifiable with good documentation.

### MINOR: "Awaiting-External" Invents Composite State

Real tools use "In Review" (a status) + optional metadata (e.g., PR link). ARC proposes "awaiting-external" as
a focus-role value, implying the issue's status is "waiting externally." This conflates status (In Review)
with role (awaiting-external).

**Potential confusion:** "Is awaiting-external a status or a role? Where does this go in the status field?"

**Mitigation:** Clear documentation that focus role is **developer-intent annotation**, distinct from status
field. An issue can be In Review (status) AND awaiting-external (focus role). The focus role means "I shipped
this and I'm not starting new primary work until it's merged."

**Risk level: MINOR.** Resolvable with clear terminology separation.

### MINOR: "Parked" Deviates from Kanban Discipline

Kanban's idiomatic practice: Work is either active (In Progress), done (Done), or backlog. There is no
"parked" state on the active board. Parked work typically returns to the backlog or a separate "Waiting"
state.

**ARC's parked:** A WU is deprioritized but kept in focus-role tracking (not archived, not backlog). This is
intentional for ARC's "awaiting latency" scenario (PR shipped, awaiting merge; don't context-switch). But it's
not idiomatic.

**Mitigation:** Document "parked" as ARC-specific (not a standard PM tool state), and justify the pattern:
"Parked WUs remain in focus-role tracking during async-merge latency, avoiding archival-then-reactivation
friction."

**Risk level: MINOR.** Explanation needed, but not controversial.

### MINOR: Focus-Role Requires Discipline to Maintain

OmniFocus and Things 3 observations: Manual focus marking (Flagged, Today) works well for 1–3 items. At higher
concurrency, drift is common (items stay Flagged after completion). Focus-role annotations will require
similar discipline.

**Mitigation:** Strategy doc should address drift detection: "At session handoff, review Focus Since values
for staleness. If primary WU has unchanged Focus Since value > 2 weeks, investigate whether the WU is
genuinely stalled or just not actively tracked."

**Risk level: MINOR.** Expected maintenance burden; not a blocker.

---

## Synthesis and Verdict on Focus-Role Vocabulary

### What ARC Should Take Seriously

1. **Status/Role Orthogonality:** ARC's most important framing is that focus role is an **orthogonal semantic
   layer** on top of status. An issue's status (Backlog, In Progress, In Review, Done) is _how far it is in
   the workflow_. Its focus role (primary, companion, awaiting-external, parked) is _the developer's intent
   about priority and attention_. These must be cleanly separated in documentation and examples.

2. **"Awaiting-External" Solves a Real Pain:** The "PR shipped, awaiting merge, starting next work" scenario
   is genuinely common and poorly served by standard PM tooling. ARC's awaiting-external role explicitly names
   this pattern and gives it first-class status. This is a **strength**, not a weakness.

3. **Single-Primary Singleton Principle:** ARC's "one primary WU at a time" maps perfectly to idiomatic
   single-assignee discipline. This is not controversial and aligns with industry best practice.

4. **Companion / Parked Are Novel:** These concepts have no direct referent in standard tooling. They are
   useful for ARC's use case (multi-WU concurrency within one developer) but will require careful
   introduction. The strategy doc should provide narrative justification, not just technical specification.

5. **No Existing Role-Based Framework Found:** The research confirms that no major PM tool, agile framework,
   or open-source project uses role-based focus annotation (primary/companion). ARC is not adopting a pattern;
   it is **inventing one**. This is acceptable if the pattern is well-motivated and clearly documented.

### Direct Verdict on Vocabulary Alignment

**ARC's focus-role vocabulary does NOT align with idiomatic practice. It invents net-new terminology.**

This is not a problem if the invention is intentional and well-motivated:

- ✅ The concepts address a real gap (multi-WU concurrency annotation).
- ✅ The values are descriptive (primary/companion/awaiting-external/parked are all transparent).
- ✅ The model is orthogonal to status/priority/assignee, not conflicting with them.
- ⚠️ Adopters will need explicit education (no existing mental model to build on).
- ⚠️ Migration friction: teams coming from Linear/Jira will see "focus role" as a non-standard field and may
  resist until value is clear.

### Recommendation: Adoption Framing

**Suggested PRD language:**

> ARC introduces a focus-role annotation layer for multi-WU coordination. This is not a standard PM tool
> construct; it is ARC-specific terminology that names patterns developers already use informally. Focus role
> (`primary | companion | awaiting-external | parked`) captures the developer's intent about work
> prioritization, orthogonal to status (In Progress, In Review, Done) which captures workflow position. No
> other surveyed framework models this explicitly; ARC is intentionally formalizing it to enable principled
> multi-WU concurrency.

This framing accomplishes:

1. Explicit non-standard acknowledgment (avoiding adopter surprise).
2. Justification for why it exists (names informal patterns).
3. Orthogonality clarification (not conflicting with standard fields).
4. Adoption stance (intentional design, not accident).

---

## Sources

**PM Tools Documentation:**

- [Linear Docs — Configuring Workflows](https://linear.app/docs/configuring-workflows)
- [Atlassian — Work with Issue Workflows](https://support.atlassian.com/jira-cloud-administration/docs/work-with-issue-workflows/)
- [Atlassian — Jira Status Anti-Patterns](https://community.atlassian.com/forums/App-Central-articles/10-Jira-Status-Anti-Patterns-and-the-10-Minute-Fi/ba-p/3138593)
- [Shortcut Help — Managing Workflow States](https://help.shortcut.com/hc/en-us/articles/205268889-Managing-Your-Workflow-States)
- [GitHub Docs — Customizing Board Layout](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-board-layout)
- [Notion Help — Status Property](https://www.notion.com/help/guides/status-property-gives-clarity-on-tasks)
- [Atlassian — Custom Fields in Trello](https://support.atlassian.com/trello/docs/working-with-custom-fields/)
- [Height Help — Overview](https://help.height.app/en/articles/3606831-height-overview)

**Open-Source Conventions:**

- [Kubernetes Contributors — Issue Triage Guidelines](https://www.kubernetes.dev/docs/guide/issue-triage/)
- [Rust RFC Book — 0002-rfc-process](https://rust-lang.github.io/rfcs/0002-rfc-process.html)

**Productivity Tools:**

- [Things 3 Features](https://culturedcode.com/things/features/)
- [OmniFocus Features](https://www.omnigroup.com/omnifocus/features/)
- [Colter Reed — Tracking Urgent and Important Tasks in OmniFocus](https://colterreed.com/tracking-urgent-and-important-tasks-in-omnifocus/)

**Idiomatic Practices:**

- [Productive.io — One Task, One Assignee: Apple's Approach](https://productive.io/blog/one-task-one-assignee-apple-method/)
- [Quire — Multiple Assignees Myth](https://quire.io/blog/p/Time-to-break-the-myth-of-Multiple-Assignees-in-Task-Management.html)
- [Atlassian — Working with WIP Limits](https://www.atlassian.com/agile/kanban/wip-limits)
- [DORA Capabilities — WIP Limits](https://dora.dev/capabilities/wip-limits/)

---

**Report compiled:** 2026-05-08  
**Research scope:** 8 PM platforms, 3 open-source projects, 3 productivity tools, 6 idiomatic pattern
sources  
**Coverage:** Status vocabulary, assignee patterns, awaiting-review composition, WIP limits, single-assignee
discipline
