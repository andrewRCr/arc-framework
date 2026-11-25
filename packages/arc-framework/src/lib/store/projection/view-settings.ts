/** Interpret Git's in-flight view values without reading or enumerating projected records. */
import type { ProjectionConfiguration } from "./configuration.js";
import type { ProjectionIndex, RefusedMark } from "./index-schema.js";
import { SlugSchema, type Slug } from "../../kernel/index.js";

/** Effective projection inputs and repair guidance for values that cannot name them. */
export interface InterpretedProjectionView {
  readonly view: ProjectionIndex["projectedUnder"]["view"];
  readonly diagnostics: readonly RefusedMark[];
}

/** Interpret the one configuration observation independently of inventory availability. */
export function interpretProjectionView(raw: ProjectionConfiguration["view"]): InterpretedProjectionView {
  const mode = raw.setting === "cohort" || raw.setting === "all" ? raw.setting : "mine";
  const diagnostics: RefusedMark[] = [], pins: Slug[] = [];
  if (raw.setting !== null && raw.setting !== mode) diagnostics.push({
    reason: `Unknown arc.inflightView value ${JSON.stringify(raw.setting)}; using mine.`,
    remedy: { text: "Set arc.inflightView to mine, cohort, or all with git config --local." },
  });
  for (const pin of raw.pins) {
    const parsed = SlugSchema.safeParse(pin);
    if (parsed.success) pins.push(parsed.data);
    else diagnostics.push({ reason: `Invalid arc.inflightPin value ${JSON.stringify(pin)}.`,
      remedy: { text: "Set each arc.inflightPin entry to a valid work-item slug, then retry." } });
  }
  return { view: { mode, pins }, diagnostics };
}
