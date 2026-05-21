# Documentation Surface Routing: External Research on Content Discipline

This research synthesizes idiomatic conventions for content discipline across
documentation surfaces: commit messages, task-tracker closing notes, PR
descriptions, and session notes. The goal is to map established external
practice so design decisions can build on proven patterns, not discover them in
isolation.

## 1. Commit-Body Conventions for Content Depth

**Subject-line standards are almost universally settled.** The "50/72 rule"—
introduced in Tim Pope's influential 2008 post and codified in Conventional
Commits—prescribes a 50-character soft limit for subject lines and 72
characters per line for body text. This derives from email formatting
conventions (80-char terminal width with 4-char left padding and right-padding
centering) and prioritizes readability across tools: terminal log viewers,
GitHub web UI, email clients, and git blame contexts [1][2][3][4].

**Body content, however, is underspecified.** Conventional Commits states the
body is "free-form" and "MAY consist of any number of newline separated
paragraphs" with no mandated format [5]. Tim Pope's canonical post emphasizes
*purpose* over *length*: the body should explain **why** a change was made, not
**what** (the diff shows that), and it should be "sensible by itself" without
reference to the subject [1]. Linux kernel guidance similarly specifies
structure ("one-line summary, blank line, then body") but leaves body content
open-ended, expecting "several paragraphs" as appropriate to context [6]. Rust
and Kubernetes communities adopt this flexibility, neither prescribing body
length caps [7][8].

**Practical linting standards do enforce body line length.** Commitlint (the
reference implementation for Conventional Commits validation) defaults to a
100-character maximum per body line—significantly longer than the 72-character
*suggestion* for readability [9]. This 100-char limit is treated as a soft
enforcement; projects adjust it for long URLs or other content [9].

**No named anti-pattern exists for "verbose commit bodies" across mainstream
OSS guides.** However, two adjacent findings are relevant:

1. **The "File List" anti-pattern** (identified in AMC: Aspiring Master of Code
   [10]) warns against listing files instead of explaining *why* changes were
   made—but this targets content quality, not length.

2. **A recent concern in agentic-coding practice** (2025–2026): AI-generated
   commits tend to repeat diff-level information ("what") rather than encode
   decision context ("why"). A 2026 paper, "Lore: Repurposing Git Commit
   Messages as a Structured Knowledge Protocol for AI Coding Agents," flags this
   as a "knowledge destruction problem"—when agents generate commits, they
   forfeit an opportunity to encode reasoning that downstream agents would
   benefit from [11]. Some tools (git-commit-agent) offer a `--detail-level
   brief` flag to control verbosity, suggesting industry recognition that
   agent-generated bodies can be excessive [11].

**Consensus:** Body content should be *purposeful and self-contained*—explaining
why the change was necessary and what tradeoffs were made—but there is no
consensus length target beyond "readable per-line" (50–75 chars, rarely 100).
Length should serve purpose, not vice versa.

---

## 2. Task-Tracker Reference Patterns in Commit Bodies

**Issue references belong in the body or footer, not the subject.** GitHub's
de facto standard (reflected in both Kubernetes and Conventional Commits
guidance) places issue references—"Fixes #123," "Closes #456," "Resolves
\#789"—at the end of the commit message, in the footer section, to keep the
subject scannable [2][8][12]. GitHub's platform automatically closes issues when
commits with these keywords are merged [2].

**However, a philosophical tradeoff exists: can the commit stand alone, or does
it require the issue tracker?** The HackerNoon essay "On Git Commit Messages and
Issue Trackers" identifies this tension: developers who lead with issue IDs
"tend to be lazy about what to write in the summary, because they are
psychologically prone to the fact that who's going to read the message, will
check the ticket itself for more details" [13]. This is treated as an
*anti-pattern*—commit messages should be **self-contained**, readable without
opening the issue tracker [13]. The recommended approach: describe the change and
rationale *first*, *then* add issue references in the footer [13].

**Restatement of issue content inside the commit body is not a recognized
anti-pattern**, but it is treated as *redundant*. The GitHub discussion "Make
default commit message the PR description or include it" acknowledges that PR
descriptions often contain contextual discussion that "would be ideal to include
in the commit message so when viewing commits in things like a git blame view,
all the context is right there" [14]. This framing treats content migration or
duplication as a *practical problem* (context gets lost), not a disciplinary
violation.

---

## 3. Body-vs-Tracker Duplication as a Named Anti-Pattern

**No widely-recognized anti-pattern named "duplication between commit and
tracker" exists in mainstream OSS guides or engineering handbooks.** The closest
related findings:

1. **Issue-ID-first is flagged as lazy.** Leading with "ABC-123" rather than a
   semantic summary encourages developers to delegate context-setting to the
   issue tracker instead of writing commit messages that stand alone [13].

2. **Knowledge loss in agentic workflows is flagged as a problem.** The 2026
   paper "Lore" argues that when agentic tools generate commits from diffs
   alone, without encoding the human's decision rationale, downstream agents
   lack the context needed to understand *why* a change was made [11]. This is
   framed as a "knowledge destruction problem," not duplication per se.

3. **Cross-surface content alignment is treated as a *practical design
   question*, not a violation.** GitHub's 2022 feature—allowing PR descriptions
   to auto-populate from commit messages—suggests that some overlap is expected
   and even desirable, but that avoiding *loss* of context across surfaces
   matters more than avoiding *restatement* [15].

**No linting rules enforce uniqueness between commit bodies and issue tracker
content.** Tools like commitlint focus on format (line length, footer structure)
and semantic categories (type prefix), not on deduplication or content
uniqueness [9].

---

## 4. 2024–2026 Agentic-Coding-Tool Conventions

**Agentic IDEs (Cursor, Cline, Windsurf, Claude Code) do not yet prescribe body
discipline explicitly.** Available documentation focuses on subject-line
structure (Conventional Commits format) and readability rules (72-char lines)
[3][16]. Cursor recommends subjects of 50–72 characters and states "Header is
required, Body and Footer are optional," suggesting flexibility [3].

**Cline supports project-specific customization via `.clinerules`.** Markdown-
based configuration files allow teams to specify commit-style preferences,
including body format, within a repository [17].

**Body verbosity is an acknowledged failure mode in agentic commits.** Multiple
tools (git-commit-agent, others) recognize that AI-generated bodies tend to
repeat diff-level information ("what") and offer `--detail-level` flags or
similar to control length [11]. The recent paper "Lore" argues this is a
critical gap: agents should encode *decision context*, not summarize diffs [11].

**Claude Code documentation** emphasizes reproducible work ("run X, change Y,
commit with message Z") but does not specify commit-message body conventions in
current docs [18].

**No agentic tool mechanically enforces deduplication between commit bodies and
task-tracker content.** This problem space appears unsolved.

---

## 5. Task-Tracker Outcome-Note / Closing-Comment Conventions

**GitHub Issues:** When an issue is closed, a final summary comment should be
posted. GitHub's guidance emphasizes that "All closed issues must have one and
only one summary comment" and the summary should encapsulate "key outcomes and
links to relevant documentation or results" [19]. If changes occur post-closure,
edit the summary comment rather than post a new one [19]. The closing summary
should be self-contained: "A user should learn all relevant results from the
deliverable without looking back at the comment thread or task description" [19].

**Linear and Jira:** Both emphasize consistent use of fields, status
transitions, and metadata, but neither prescribes a closing-comment template in
search results [20][21]. Jira treats comments as "the backbone of effective
communication," distinguishing between internal notes and customer-facing
replies [20]. Linear's design philosophy favors clarity and reduces
configuration burden, but the search results do not surface explicit
closing-comment conventions [20].

**GitLab:** Commit templates and integration features support linking commits to
issues (e.g., square-bracket notation for Pivotal Tracker), and external
tracker integration allows CODE-123 references, but no explicit closing-comment
convention is documented [22].

**Basecamp Shape Up methodology:** Tasks are tracked as To-Do Items within
scopes; when must-haves are complete, a scope is marked "done." Discussion
threads on To-Do Items support async updates. Shape Up emphasizes scope
definition (nice-to-haves vs. must-haves) over closing ceremonies, focusing on
work definition rather than closing documentation [23].

**General PM practice:** Engineering teams use task-closing comments to confirm
completion, document blockers or dependencies, and consolidate decisions. Best
practices emphasize using bullet points or numbered lists, starting with a
concise summary followed by supporting detail, and ensuring clarity so "any
engineer or team member would understand expectations without further
clarification" [24].

**Key divergence:** GitHub prescribes explicit, singular closing summaries;
Jira/Linear emphasize metadata and status tracking; Shape Up de-emphasizes
closing notes in favor of upfront scope definition. No universal standard
exists; tools vary by philosophy.

---

## Key Synthesis Points

**1. Consensus on purpose:** Commit bodies, issue descriptions, and closing
notes should all explain **why** and **what** (high-level), not **how** (diff-
level). This is consistent across Tim Pope, Linux kernel docs, Conventional
Commits, and agentic-tool guidance [1][2][5][6][11].

**2. Body length is purposeful, not arbitrary.** The 72-char readability
guideline is solid, and 100-char linting limits are common, but neither
prescribes overall message length. Length should reflect complexity; a one-line
fix may not need a body, and a complex refactor may warrant several paragraphs
[1][7][8].

**3. Duplication is not a named anti-pattern; loss of context is.** No OSS
guide warns against restatement of issue content in commits. Instead, guides
warn against *dependency* on external trackers and emphasize *self-containment*
(the commit should be readable standalone). The GitHub feature that allows PR
descriptions to populate from commits suggests some overlap is expected [13][14]
[15].

**4. References (issue IDs, RFC numbers, ADR links) belong in footers, not
subjects.** This is nearly universal across Conventional Commits, Kubernetes,
GitHub, and Rust guidance [2][7][8][12].

**5. Task-tracker closing notes lack uniform convention.** GitHub prescribes
explicit summaries; others vary. No standard shape for "task outcome comment"
exists across platforms [19][20][21][22].

**6. Agentic tools are still discovering best practices.** The verbosity problem
is acknowledged (2025–2026 literature); solutions (detail-level flags, decision-
context encoding) are emerging but not yet standard [11][17][18].

---

## Sources

[1]: https://cbea.ms/git-commit/
[2]: https://www.conventionalcommits.org/en/v1.0.0/
[3]: https://learn-cursor.com/en/blog/posts/cursor-git-commit
[4]: https://www.baeldung.com/ops/git-commit-messages
[5]: https://www.conventionalcommits.org/en/v1.0.0/
[6]: https://archive.kernel.org/oldwiki/git.wiki.kernel.org/index.php/CommitMessageConventions.html
[7]: https://github.com/rust-lang/rust-analyzer/issues/2866
[8]: https://www.kubernetes.dev/docs/guide/pull-requests/
[9]: https://commitlint.js.org/reference/rules.html
[10]: https://amcaplan.ninja/blog/2016/12/26/git-commit-message-anti-patterns/
[11]: https://arxiv.org/pdf/2603.15566
[12]: https://medium.com/@abedmaatalla/how-to-link-github-commits-branches-to-github-issues-7afadef13971
[13]: https://medium.com/hackernoon/on-git-commit-messages-and-issue-trackers-f700f3cbb5a7
[14]: https://github.com/orgs/community/discussions/4584
[15]: https://github.blog/changelog/2022-09-07-better-suggested-pull-request-description-from-commit-message/
[16]: https://www.ikangai.com/agentic-coding-tools-explained-complete-setup-guide-for-claude-code-aider-and-cli-based-ai-development/
[17]: https://medium.com/@marksusol/teaching-cline-to-write-your-commit-messages-a-practical-guide-to-clinerules-in-jetbrains-6e5593ee81a6
[18]: https://code.claude.com/docs/en/best-practices
[19]: https://blog.zenhub.com/best-practices-for-github-issues/
[20]: https://onehorizon.ai/blog/jira-vs-linear-ultimate-comparison-for-modern-product-teams
[21]: https://linearb.io/blog/jira-best-practices
[22]: https://docs.gitlab.com/user/project/merge_requests/commit_templates/
[23]: https://basecamp.com/shapeup/3.4-chapter-13
[24]: https://www.projectmanagertemplate.com/post/project-closeout-checklist-an-ultimate-guide
