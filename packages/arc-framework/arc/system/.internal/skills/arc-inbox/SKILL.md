---
name: arc-inbox
description: Route a discovered concern now when committed, or capture it for later in USER-INBOX with a candidate home.
disable-model-invocation: false
arc:
  methods:
    - route-discovered-work
    - classify-work-unit
---

# ARC Inbox

Route a discovered concern now or capture it for later. Consult `DEV-RULES.ARC § Discovered Work Routing` for the
inline / errand-now / defer call. `arc-housekeep` drains captures; `arc-session` enters execution.

1. Choose route-now or capture.

   - Fix a current-WU concern inline. For another concern, ask whether the session holds the commitment to place it
     now. Without commitment, continue at step 2 for capture; with it, invoke the fast path below.
   - When `arc-errand` hands back an outcome the Owner already confirmed, enter this step's hand-off directly,
     without invoking the gate again or repeating step 2's classification.

   **Method fire-point** · `route-discovered-work` — load `.arc/system/methods/route-discovered-work.md`:

   ```yaml
   route-discovered-work:
     entry: the discovered concern, with any WU_Target and _Shapes_
     door: fast path
   ```

   > [!IMPORTANT]
   > `workflow-interlock`: Stop before carrying out the proposed route. Show the outcome, `_Shapes:_`, any unclear
   > pair and its four record answers, the coupled target's horizon advisory verbatim, and any named wait. For a
   > new stub, show every minting judgment the method requires. Await approval before the hand-off.

   **Hand-off — follow the method's binding.** A `fold` lands only in the session's own work unit. Run an immediate
   `errand` through `arc-errand`; a now-route outside the session's own work unit that writes a backlog stub or mints
   a stub takes that skill's route-only shape. Deferred `errand`, pre-routed capture, and `capture` outcomes continue
   at steps 3–5, with section, `WU_Target` and `_Shapes:_` from the confirmed result, skipping step 2. Errands use
   `## Errand` without a work-unit home; a Work Unit capture carries its candidate target or `TBD`. A started target
   takes the binding's owner-adoption capture or named wait. `dismiss` writes nothing.

2. Classify by fate → section.

   - **Errand** — self-evident, single-session, below both intrinsic floors → `## Errand`. Atomic in character:
     one indivisible concern (possibly an extended sweep), no design to record and no durable cross-session plan a
     correct execution must navigate.
   - **Work Unit** — clears either floor (a design worth recording, or a durable cross-session plan) → `## Work Unit`.
   - Pick by _fate_ (the two-floor gate), not by destination — the section is the routing fate; the finer home
     (existing stub, new stub, standalone errand, shared flush) resolves later at the drain.
   - **Infra smell (advisory, never a gate):** touching load-bearing infrastructure is a review-lane signal.
     For a second look at design hiding in an Errand capture, load `.arc/system/methods/classify-work-unit.md` and apply
     boundary test 1's record questions; a design fork alone does not promote it. Capture stays coarse, and the drain
     re-triages it.

3. Build the entry.

   Shared shape — an H3 heading carrying a `[ ]` checkbox and a bold title, then italic-descriptor
   sub-bullets. Multi-line bullets separate with a blank line (loose-list).

   - **Descriptors** (prose, bare values): `_Observation:_`, `_Approach:_`, `_Files:_`, `_Scope:_`,
     `_Captured during:_`, `_Shapes:_` — and others as the entry warrants.
   - **`## Errand`** — the shared shape; **no `WU_Target`**. May carry the reminder flag (step 4).
   - **`## Work Unit`** — the shared shape **plus a `WU_Target:` line** naming a candidate the drain's gate checks:
     - `WU_Target: <slug>` — check coupling and exclusions there; existence alone never establishes a home.
     - `WU_Target: <slug> (planned|provisional)` — a new-stub commitment hint, subject to the drain's Owner stop.
     - `WU_Target: TBD` — undecided; resolved at drain.
     - `_Shapes:_ <decision or section>` — optional capture-time coupling evidence; the drain validates it against
       the target's current design. No `new` keyword; the gate decides existing versus new stub.

   ```markdown
   ### `[ ]` **Short imperative title**

   - _Observation:_ what surfaced and why it matters.
   - _Approach:_ the likely shape of the fix (optional).
   - _Captured during:_ <the work in hand>.
   ```

4. Reminder flag — `## Errand` only, optional.

   When the developer asks not to forget a capture, set the managed reminder field so session-init
   nudges them after a delay:

   - ``- _Remind:_ `true` `` — a _parsed_ field marks itself by **backtick-delimiting its value** (the
     key stays bare-italic), distinguishing it from prose descriptors. Write it only when set; its
     absence reads as `false`.
   - ``- _Created:_ `<YYYY-MM-DD>` `` — **stamp the current date** yourself as the aging anchor (value
     backtick-delimited). It is tool-stamped at capture, not hand-written by the developer.

   These drive the personal-`USER-INBOX`-only reminder nudge gated by `inbox.remind_after_days`. For
   the field grammar and the nudge cadence, see `strategy-session-operations.md § USER-INBOX`.

5. Write it.

   - Append the entry to the chosen section of the resolver-backed identity-global `USER-INBOX.md`
     (under linked-worktree operation, the primary worktree's `user/{identity}/USER-INBOX.md`, not a
     linked worktree's checkout-local copy). It is personal and gitignored, so it accepts writes any
     time, from any branch, with no isolation cost. Leave existing entries in place; `USER-INBOX`
     drains at the between-WUs `arc-housekeep` flow.
   - **Every Errand-class capture** has no work-unit home. Capture it to `## Errand`; at the next drain it takes
     the homeless-atomic route — execution, shared-inbox deferral, or explicit Owner retention. Never write the
     shared inbox directly from capture. Spec-worthy concerns take the drain's gate instead.
