/** Authority over meta lifecycle fields is derived from the write's provenance. */
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
import { brokenRule } from "../rule-support.js";
import { metaFieldChanged, metaFieldVersions } from "./check-support.js";

/** Guard verb-owned meta creation, removal and fields.
 * @param input - Proposed metadata write.
 * @returns The authority violation, if any.
 */
export function checkMetaVerbOwnedField(input: WriteCheckInput): readonly BrokenRule[] {
  if (input.writer.kind === "verb") return [];
  const versions = metaFieldVersions(input);
  const changesOwnedField = (["state", "workClass", "currentWorkflow"] as const)
    .some((key) => metaFieldChanged(versions, key));
  return input.prior === undefined || input.next === undefined || changesOwnedField
    ? [brokenRule("meta.verb-owned-field", "A hand edit creates or removes metadata, or changes State, Class, or Current Workflow.",
      "Use the lifecycle or Class verb that owns the change, then retry the remaining hand edit.")] : [];
}
