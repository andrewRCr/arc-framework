/**
 * The park@Active **pointer-record** — a render-pointer for a parked Active WU.
 *
 * When an Active-phase work unit is parked, its authoritative artifacts stay on
 * the preserved (pushed) branch — the durable shelf — and the tracked tree
 * carries only a minimal *pointer-record*: a meta whose `State` is the literal
 * **`Active`** (resolver-valid; the `parked` state is *derived* from the
 * `backlog/planned/` location, never stored), the authoritative `Branch`, and the
 * render fields the project-readiness views need. Because a raw `State: Active`
 * under `backlog/` reads ambiguously, the record **opens with a derived-state
 * callout** naming the parked state, the authoritative branch, and the park
 * reason — blessing the shape as a legal render artifact rather than drift.
 *
 * This is ADR-022's record/projection model applied early to one bounded state:
 * the pointer is a regenerated projection (never hand-edited); the branch meta is
 * authoritative. The composer is **pure** — it derives the file text from its
 * inputs and touches no filesystem; the verb contract owns the write.
 *
 * @module
 */

import { renderMetaFile, type MetaFieldOverrides } from "../active/meta-reader.js";

/** The inputs a {@link composePointerRecord} render needs. */
export interface PointerRecordInput {
  /** Work-unit name — the meta H1 and slug. */
  name: string;
  /** Authoritative preserved branch (e.g. `feat/<name>`) — the durable shelf. */
  branch: string;
  /** Free-form park reason, rendered in the derived-state callout. */
  reason: string;
  /**
   * Render fields carried from the source meta (`Owner` / `Class` / `Priority` /
   * `Cohort` / `Depends On` / `Origin` / `Design`). `State` and `Branch` are set
   * by the composer and override any supplied here; the progress / directive
   * narrative is deliberately *not* carried — it stays authoritative on the branch.
   */
  renderFields: MetaFieldOverrides;
}

/**
 * Compose the park@Active pointer-record markdown — the derived-state callout
 * followed by the minimal render-pointer meta.
 *
 * The callout opens the file (above the H1, so it is human-first and the meta
 * parser — which reads from the H1 down — ignores it). The meta carries the
 * literal `State: Active`, the authoritative `Branch`, and the supplied render
 * fields; everything else renders at its default.
 *
 * @param input - The WU name, preserved branch, park reason, and render fields.
 * @returns The pointer-record markdown, terminated by a single newline.
 */
export function composePointerRecord(input: PointerRecordInput): string {
  const overrides: MetaFieldOverrides = {
    ...input.renderFields,
    State: "Active",
    Branch: input.branch,
  };
  const callout = [
    `> **Parked** — Active-phase work shelved here; authoritative artifacts on branch \`${input.branch}\`.`,
    `> Reason: ${input.reason}`,
    `> Regenerated pointer — do not hand-edit.`,
  ].join("\n");
  return `${callout}\n\n${renderMetaFile(input.name, overrides)}`;
}
