/** Authority over meta lifecycle fields is derived from the write's provenance. */
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
import { brokenRule } from "../rule-support.js";
import { readMetaSectionBodies } from "./line-reading.js";
import { metaFieldChanged, metaFieldVersions } from "./check-support.js";

/** Guard verb-owned meta creation, removal and fields.
 * @param input - Proposed metadata write.
 * @returns The authority violation, if any.
 */
export function checkMetaVerbOwnedField(input: WriteCheckInput): readonly BrokenRule[] {
  if (input.writer.kind === "verb") return [];
  const versions = metaFieldVersions(input);
  const changed = (["state", "workClass", "currentWorkflow", "owner", "pause"] as const)
    .filter((key) => metaFieldChanged(versions, key));
  const pauseChanged = JSON.stringify(readMetaSectionBodies(input.prior?.content ?? "", "Pause"))
    !== JSON.stringify(readMetaSectionBodies(input.next?.content ?? "", "Pause"));
  if (pauseChanged && !changed.includes("pause")) changed.push("pause");
  if (input.prior !== undefined && input.next !== undefined && changed.length === 0) return [];
  const remedies: string[] = [];
  if (changed.includes("owner")) remedies.push(`Use arc handover ${input.reference.owner.name} --to <identity> to change Owner.`);
  if (changed.includes("pause")) remedies.push(`Use arc pause ${input.reference.owner.name} or arc resume ${input.reference.owner.name} to change the pause section.`);
  if (remedies.length === 0 || changed.some((key) => key !== "owner" && key !== "pause")) {
    remedies.push("Use the lifecycle or Class verb that owns the change, then retry the remaining hand edit.");
  }
  return [brokenRule("meta.verb-owned-field",
    "A hand edit creates or removes metadata, or changes State, Class, Current Workflow, Owner, or the pause section.",
    remedies.join(" "))];
}
