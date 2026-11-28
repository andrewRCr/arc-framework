---
name: arc-inbox
description: Route a discovered concern now when committed, or capture it for later in the personal inbox with a candidate home.
disable-model-invocation: false
arc:
  methods:
    - route-discovered-work
    - classify-work-unit
---

# ARC Inbox

Route a discovered concern now or capture it for later. Consult `DEV-RULES.ARC § Discovered Work Routing` for the
inline / message / errand-now / defer call. `arc-housekeep` drains captures; `arc-session` enters execution.

1. Choose route-now or capture.

   - Fix a current-WU concern inline. A concern for another work unit with a checkout takes the fast path below
     whatever the commitment; the method decides any message to its session. For another concern, ask whether the
     session holds the commitment to place it now. Without commitment, continue at step 2 for capture; with it,
     invoke the fast path below.

   **Method fire-point** · `route-discovered-work` — load `.arc/system/methods/route-discovered-work.md`:

   ```yaml
   route-discovered-work:
     entry: the discovered concern, with any WU_Target and _Shapes_
     door: fast path
   ```

   > [!IMPORTANT]
   > `workflow-interlock`: Stop before carrying out the proposed route. Show the outcome, `_Shapes:_`, any unclear
   > pair and its four record answers, the coupled target's horizon advisory verbatim, and any message to a live
   > target. For a new stub, show every minting judgment the method requires. Await approval before the hand-off.

   **Hand-off — follow the method's binding.** A `fold` lands only in the session's own work unit. Run an immediate
   `errand` through `arc-errand`. Carry out a now-route outside the session's own work unit — a `hold` or a
   `new-stub` — here, through the binding's verbs, and send a live target's confirmed message beside it or hand it to
   the Owner to relay. Deferred `errand`, pre-routed capture, and `capture` outcomes continue at steps 3–5, with
   section, `WU_Target` and `_Shapes:_` from the confirmed result, skipping step 2. Errands use `## Errand` without a
   work-unit home; a Work Unit capture carries its candidate target or `TBD`. `dismiss` writes nothing.

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
   - **`## Work Unit`** — the shared shape **plus a top-level `_WU_Target:_` bullet**, its value backtick-delimited
     like every parsed field (step 4), naming a candidate the drain's gate checks:
     - ``- _WU_Target:_ `<slug>` `` — check coupling and exclusions there; existence alone never establishes a home.
     - ``- _WU_Target:_ `<slug> (planned|provisional)` `` — a new-stub commitment hint, subject to the drain's Owner
       stop.
     - ``- _WU_Target:_ `TBD` `` — undecided; resolved at drain.
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
   - ``- _Created:_ `<YYYY-MM-DD>` `` — the aging anchor, which `arc route` stamps with the capture date at step 5;
     leave it out of the entry you write.

   These drive the personal-inbox-only reminder nudge gated by `inbox.remind_after_days`. For the field grammar and
   the nudge cadence, see `strategy-session-operations.md § USER-INBOX`.

5. Write it.

   - From any checkout, add the entry to the chosen section of your personal inbox with
     `arc route --to personal --section <Errand | "Work Unit">` and pass the entry on standard input. The verb stamps
     `_Id:_` and `_Created:_`. ARC accepts personal inbox writes only from the inbox's identity. Anyone with read access
     to the state remote can read entries published by `arc sync`. Leave existing entries in place for the between-WUs
     `arc-housekeep` drain.
   - **Every Errand-class capture** has no work-unit home. Capture it to `## Errand`; at the next drain it takes
     the homeless-atomic route — execution, project-inbox deferral, or explicit Owner retention. Never write the
     project inbox directly from capture. Spec-worthy concerns take the drain's gate instead.
