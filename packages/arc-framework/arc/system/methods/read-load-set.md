---
name: read-load-set
description: Execute grouped context reads with complete read modes and verified task anchors
override-active: false
---

# Method: read-load-set

> - **Workflow:** [session-init.md][session-init], [session-recover.md][session-recover]
> - **When:** A consumer executes its supplied context-read plan
>
> - **Contract:** Read the supplied context completely, respecting its groups, manifest order, modes, and task anchors.

## read-load-set.override

[No override configured]

## read-load-set.default

Use the consumer's supplied entries, paths, and anchors from its bound checkout. Init supplies each `read` step's
`cursor`; recovery supplies its audit report's verified `taskCursor`. Never substitute the meta's `**Next Task:**`.

Process numbered read groups in ascending order; entries without a `group` form one group. Issue each group's
independent reads in one tool message, in parallel when supported. Finish the group before starting the next.
Manifest order governs the context and its interpretation, however individual reads finish. Continue any truncated
result by re-reading the remainder by offset until the requested content is complete.

Apply each entry's `readMode`:

- **`full`** — read the whole file.
- **`partial-section`** — read the named heading's section, including its subheadings, through the line before the
  next heading of equal or higher level.
- **`partial-strategic`** — use the supplied cursor's `section` and `leaf` to read the task-list slices below.

For a strategic read, build one structural map of phase and parent-task headings for any offsets needed. Read:

1. **Header:** the content above the first `## **Phase` heading.
2. **Current phase preamble:** derive the phase id by stripping the final segment from `section.id` (`5.3` → `5`,
   `3.R.e` → `3.R`). Read from `## **Phase {id}:**` through the line before the phase's first checkbox.
3. **Current task section:** start at `section.lineHint`; if stale, locate the section by its id, then its title.
   Read through the line before the next parent task or phase heading. `leaf` identifies the executable checkbox
   within that section.

Surface a missing header or phase preamble and continue with the slices that resolve. Report an unlocatable task
section to the consumer: init skips that read and surfaces a mismatch; recovery stops. Report other read failures
rather than substituting another file, section, or task anchor.

---

[session-init]: ../workflows/arc/session-lifecycle/session-init.md
[session-recover]: ../workflows/arc/session-lifecycle/session-recover.md
