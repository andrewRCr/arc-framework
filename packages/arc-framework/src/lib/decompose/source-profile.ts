/** Planning profiles selected from Design rather than incidental stored artifacts. */
import type { ParsedMetaRecord } from "../active/meta-schema.js";
import type { DecomposeOriginRecords } from "./acquire-origin.js";
import type { CutMapMachine } from "./cut-map-machine.js";
import type { DecomposeResult, DecomposeRefusal } from "./refusal.js";

/** Infer and validate the declared design profile and optional task-list pointer. */
export function decomposePlanningProfile(input: DecomposeOriginRecords, fields: ParsedMetaRecord): DecomposeResult<CutMapMachine["planningProfile"]> {
  const slug = input.primary.reference.owner.name;
  const design = fields.design;
  let profile: CutMapMachine["planningProfile"];
  if (design.length === 1 && design[0] === `draft-${slug}.md`) {
    profile = { kind: "draft", sourceDesign: [design[0]] };
  } else if (design.length === 1 && design[0] === `spec-${slug}.md`) {
    profile = { kind: "single-spec", sourceDesign: [design[0]] };
  } else if (design.length === 2 && design[0] === `spec-${slug}-prd.md` && design[1] === `spec-${slug}-rfc.md`) {
    profile = { kind: "paired-spec", sourceDesign: [design[0], design[1]] };
  } else return profileRefusal("Design", "Name one draft, one spec, or the ordered paired specs in Design.");
  for (const basename of profile.sourceDesign) {
    if (input.artifacts.filter(artifact => artifact.basename === basename).length !== 1) {
      return profileRefusal(basename, "Restore the design artifact named by Design, then retry.");
    }
  }
  if (fields.taskList !== null) {
    const expected = `tasks-${slug}.md`;
    if (profile.kind === "draft" || fields.taskList !== expected) {
      return profileRefusal("Task List", "Correct Task List to agree with the declared planning profile, then retry.");
    }
    if (input.artifacts.filter(artifact => artifact.basename === expected).length !== 1) {
      return profileRefusal(expected, "Restore the task list named by Task List, then retry.");
    }
  }
  return { status: "ok", result: profile };
}

function profileRefusal(locus: string, text: string): DecomposeRefusal {
  return { status: "refused", reason: "planning-profile", class: "recoverable", locus, remedy: { text } };
}
