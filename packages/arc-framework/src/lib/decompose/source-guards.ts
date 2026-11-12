/** Source metadata and copied-design prerequisites shared by every decomposition mode. */
import type { DecomposeOriginRecords } from "./acquire-origin.js";
import type { DecomposeSourceFacts } from "./source-facts.js";
import type { ParsedMetaRecord } from "../active/meta-schema.js";
import type { DecomposeRefusal } from "./refusal.js";
import { MetaPrioritySchema } from "../active/meta-schema.js";
import { SlugSchema } from "../kernel/index.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";

/** Check the fields and title floor every new member's scaffold copies. */
export function checkDecomposeScaffoldSource(input: DecomposeOriginRecords, fields: ParsedMetaRecord,
  profile: DecomposeSourceFacts["planningProfile"]): DecomposeRefusal | undefined {
  const missing = !SlugSchema.safeParse(fields.owner).success ? "Owner"
    : !MetaPrioritySchema.safeParse(fields.priority).success ? "Priority"
    : fields.origin === null || fields.origin.trim() === "" ? "Origin" : null;
  if (missing !== null) return sourceRefusal(missing, fieldRepair(missing, input.primary.reference.owner.name));
  for (const basename of profile.sourceDesign) {
    const artifact = input.artifacts.find(item => item.basename === basename);
    if (artifact !== undefined && !artifact.record.content.replace(/^\uFEFF/u, "").startsWith("# ")) {
      return sourceRefusal(basename, "Restore the copied design's level-one title on its first line through write-back, then retry.");
    }
  }
  return undefined;
}

function sourceRefusal(locus: string, text: string): DecomposeRefusal {
  return { status: "refused", reason: "source-artifact", class: "recoverable", locus, remedy: { text } };
}

function fieldRepair(field: string, origin: string): string {
  if (field === "Owner") return `Restore Owner with ${renderV3DecomposeArgv(["arc", "handover", origin, "--to", "<identity>"])}, then retry the selected mode.`;
  return `Restore ${field} on the origin through write-back, then retry the selected mode.`;
}
