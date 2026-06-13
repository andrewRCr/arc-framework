# Strategy: Workflow Authoring

Conventions for authoring ARC workflow files — frontmatter schema, declaration rules, body conventions.

**Scope:**

- Framework workflows (`system/workflows/arc/`) — authored by framework contributors
- Project workflows (`system/workflows/project/`) — authored by the project team

For canonical structure, see [`template-workflow.md`][template-workflow].

---

## Contents

- [Frontmatter Schema](#frontmatter-schema) — fields, namespaces, enforcement
- [Author-side Declaration Rule](#author-side-declaration-rule) — trigger contract
- [Body Conventions](#body-conventions) — structure, links, interlock markers, routing class tags

---

## Frontmatter Schema

Workflow documents declare their metadata — and, when applicable, their method and extension dependencies —
through YAML frontmatter at the top of the file. The frontmatter is the structural trigger contract: declarations
under the `arc:` namespace are mechanically enforced; top-level fields are editorial.

```yaml
---
purpose: <one-sentence description of what this workflow does>
audience: agent                  # agent | collaborative (human and agent) | human
arc:                              # omit if this workflow loads no methods/extensions
  methods:
    - <method-name>
  extensions:
    - <extension-name>
---
```

**Top-level fields** (editorial — readable by humans and machines, not mechanically enforced):

- `purpose` — single-sentence workflow purpose; use a YAML block scalar (`purpose: |`) for multi-line text
- `audience` — one of:
    - `agent` — agent-executed; the developer observes and approves at checkpoints
    - `collaborative (human and agent)` — developer and agent work through the workflow together
    - `human` — reference material for developers; not loaded by agents during session lifecycle

**`arc:` namespace** (protected — mechanically enforced by CI):

- `arc.methods` — array of method names the workflow loads
- `arc.extensions` — array of extension names the workflow checks
- Names match the file basename in `system/methods/` / `system/extensions/`.

---

## Author-side Declaration Rule

When a workflow loads a method or extension, declare it in the workflow's frontmatter `arc.methods` or
`arc.extensions` array. The declaration is the load contract — agents load declared dependencies when they
read the workflow; body-level prose references (in-step markdown links, "see X" pointers) remain for reader
navigation but do not constitute the trigger.

**Enforcement.** Pre-commit hooks validate schema shape and verify declared names resolve to real
methods/extensions — both corpora. The corpus-wide coverage audit (every registered method and extension is
declared by at least one workflow) runs in the framework repo's CI only; project workflows opt into whatever
subset they need and carry no coverage requirement.

---

## Body Conventions

- `# Workflow: [Title]` — required H1
- Body structure is author's choice. Use whatever pattern fits the workflow — numbered `## Steps`, named phases
  (`## Task Implementation`, `## Verification Phase`), or prose sections. Workflows vary; no single structure
  fits all.
- One frontmatter block at the top. Do not duplicate `**Audience:**` or `**Purpose:**` callouts in the body.
- Reference-style links collected at the file end — one `---` separator, then link definitions.

### Prose economy — write for the executing session

Workflow prose is read by an agent *executing* the workflow, often on every run. The test for each line:
**does a session executing this need it to act correctly?** Keep procedure and load-bearing constraints —
the rule, the format, when to skip; cut author-facing justification — "what this is / isn't" framing,
rationale for *why* a rule exists, and restatements of guidance an adjacent inline hint already carries.
Rationale an author needs to trust the design belongs in the planning artifact (spec, draft, ADR), not in
prose a session re-reads each run. Compress to the instruction; justification rarely earns its per-run token
and judgement cost.

### Interlock markers

Workflows that gate progress at a control point — agent stops to surface state and await direction —
mark the gate with a callout block. The callout makes the stop point scannable in the rendered doc and
gives the agent a recognizable trigger to fire on.

**Types:** Three always-stop (`task-`, `workflow-`, `integration-`) and two configurable (`commit-`,
`push-`, governed by `arc.commitInterlock` and `arc.pushInterlock`). See [DEV-RULES.ARC][dev-rules-arc]
§ Commit Discipline for behavioral rules and [AGENT-BRIEF.ARC][agent-brief-arc] § Vocabulary for the
interlock concept.

**Canonical shape:**

```markdown
> [!IMPORTANT]
> `{type}-interlock`: Stop {trigger}. Surface {what}; await direction before {next-action}.
```

**Phrasing structure:**

- **Trigger** — when the stop fires (`after X is committed`, `before creating the PR`).
- **Surface** — what the agent presents at the stop (typically the state of the gated artifact).
- **Next-action** — what proceeds on approval (the destructive cascade or downstream workflow
  boundary the marker gates). Specify the advance signal; bare `await direction` is too thin.
  Two acceptable shapes:
    - **Quoted-verb form** — `await explicit '<verb>' direction` (e.g., `'merge'`, `'commit'`,
      `'sweep'`). Use for destructive or named-action gates where the verb is the load-bearing
      signal — user's instruction contains the verb.
    - **Named-target form** — `await approval before proceeding to <named-target>` (e.g., `Pass 2`,
      `archive ceremony`). Use for progression gates where the next step is already known —
      user's approval triggers advancement to the named target.

**Placement:** Embed the marker at the position its trigger fires:

- **"After X" triggers** (`Stop after the PRD is saved`) — marker at the end of the step that produces X,
  before the next step's heading.
- **"Before X" triggers** (`Stop before composition begins`) — marker at the start of the step that
  performs X, immediately under that step's heading. Use this for destructive cascades (commit, merge,
  sweep, push) where the gate must fire before the action begins.

The marker is an embedded gate, not a numbered body step. Don't allocate a step whose entire content is
the callout — dissolve into the trigger-appropriate position.

**Don't entangle gate with fire.** Interlocks gate progress; they don't perform the operation.
When the gated step contains a commit (or other named action), write the action as a separate
line below the marker — e.g., ``Then commit (`workflowCommit`): ...`` — not folded into the
marker's `await direction before ... committing` language. The fire stays scannable as its own
action; the marker stays clean as a pure gate.

### Routing class tags

Workflow fire sites for commits and pushes may carry a backtick-wrapped class tag —
`` `taskCommit` ``, `` `workflowCommit` ``, `` `workflowPush` `` — that lets the agent route
through the release-wrapper layer when configured. Untagged sites invoke raw `git`. The
canonical routing rule lives in [DEV-RULES.ARC][dev-rules-arc] § Commit Discipline; this
section covers author-side declaration shape.

**When to class-tag.** Tag sites that fit the class semantics:

- `taskCommit` — per-task commits inside the task execution loop
- `workflowCommit` — ceremony commits (activate / integrate / handoff / archive)
- `workflowPush` — ceremony pushes (handoff / activation / integration)

Ad-hoc commits, recovery operations, and push paths that should always run raw remain
unannotated; they route as `raw` regardless of opt-in state.

**Admonition pattern.** Class-tagged fire sites use a `[!CAUTION]` admonition mirroring the
interlock-marker shape (gate/fire structural symmetry: both backtick-wrap the interlock name in
leading position). The admonition names the interlock being released and the class tag firing —
the agent supplies `git commit -m` / `arc release commit` (or `git push` / `arc release push`) per
the resolved routing.

- **Commit fire sites:** admonition with backtick-wrapped interlock name + class tag + colon,
  then message body in a `text` codeblock:

    ````markdown
    > [!CAUTION]
    > `commit-interlock` release — commit as `workflowCommit`:

    ```text
    chore(arc): handoff

    Context: meta-name.md (handoff)
    ```
    ````

- **Push fire sites:** admonition with interlock name + class tag + push args inline:

    ```markdown
    > [!CAUTION]
    > `push-interlock` release — `workflowPush`: `-u origin {branch-name}`.
    ```

- **Multi-step bash sequences:** When a fire is part of a multi-command sequence (e.g., branch
  rename + push + remote-cleanup), inline `# <class>` comment annotation in the bash block is
  acceptable — admonition extraction would fragment the sequence.

**Destructive flags stay literal.** Flags like `--delete`, `--force`, and `--force-with-lease`
are never class-tagged — the wrapper refuses them by design. Workflows needing destructive
operations write the literal `git push --delete <ref>` (or equivalent) inline, outside any
class-tag annotation.

**Sync push exception.** `arc sync` handles its own internal push; sync invocations are captured
on the audit umbrella but do not re-route through `arc release push`. Workflows that invoke
`arc sync` rely on its internal handling and do not class-tag the implicit push.

The exception is class-tag-routing scope only — extension markers (`pre-push-review` and the
broader pre-* family) still fire on workflow steps that invoke a push, including `arc sync`. Place
the marker before the sync invocation; the agent loads the extension's `.actions` per the
established contract regardless of how the push itself routes.

---

[template-workflow]: ../../templates/arc/template-workflow.md
[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md
[agent-brief-arc]: ../../../reference/briefs/AGENT-BRIEF.ARC.md
