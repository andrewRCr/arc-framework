/** Shape and surviving-origin constraints over source allocations. */
import type { CutMap } from "./cut-map-schema.js";
import type { CutMapIssue } from "./cut-map-issues.js";

/** Require a source lifecycle role compatible with the authored shape. */
export function cutSourceKindIssue({ machine, authoring }: CutMap): CutMapIssue | null {
  const extraction = authoring.shape === "extraction";
  if ((machine.sourceKind === "active-origin" && !extraction)
    || (machine.sourceKind === "backlog-stub" && extraction)) return {
    code: "source-shape", path: "machine.sourceKind",
    message: extraction ? "Extraction requires a started-Planning or Active surviving origin."
      : "Retirement shapes do not accept an Active surviving origin.",
  };
  return null;
}

/** Keep companions and retained scope at the surviving extraction origin. */
export function cutSourceAllocationIssue({ machine, authoring }: CutMap): CutMapIssue | null {
  const extraction = authoring.shape === "extraction";
  if (extraction) {
    const companion = machine.sourceUnits.findIndex((unit, index) =>
      !machine.planningProfile.sourceDesign.includes(unit.sourceLocator.artifact)
      && authoring.sourceAllocations[index]?.disposition.kind !== "retained-origin");
    if (companion >= 0) return {
      code: "companion-disposition", path: `authoring.sourceAllocations.${companion}.disposition`,
      message: "Extraction companion allocations must remain at the surviving origin.",
    };
  }
  for (const [index, allocation] of authoring.sourceAllocations.entries()) {
    if (allocation.disposition.kind !== "retained-origin") continue;
    if (!extraction) return {
      code: "source-shape", path: `authoring.sourceAllocations.${index}.disposition`,
      message: "Only extraction may retain source scope at the surviving origin.",
    };
    if (allocation.ownership !== "destination-owned") return {
      code: "source-shape", path: `authoring.sourceAllocations.${index}.ownership`,
      message: "Retained-origin scope must carry destination-owned ownership.",
    };
  }
  return null;
}
