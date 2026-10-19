/** Pure source-kind, planning-profile, and allocation-unit derivation over acquired records. */
import type { DecomposeOriginRecords } from "./acquire-origin.js";
import type { CutMapMachine } from "./cut-map-machine.js";
import type { DecomposeResult } from "./refusal.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { readLifecycleMetaFields } from "../store/lifecycle-write.js";
import { decomposePlanningProfile } from "./source-profile.js";
import { scanV3DecomposeContent } from "../work-unit/decompose-content.js";
import { cutSourceId } from "./cut-map-machine.js";
import { digestBytes } from "../kernel/canonical/canonical-json.js";
import { SlugSchema } from "../kernel/index.js";
import type { StoreRecord } from "../store/read.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";
import { decomposeDiscardArgv } from "./command-argv.js";

/** Machine facts established without dependency lookup or start-only guards. */
export type DecomposeSourceFacts = Pick<CutMapMachine, "origin" | "sourceKind" | "planningProfile" | "sourceUnits">;

/** Derive source facts from one acquired record group without further I/O. */
export function deriveDecomposeSource(input: DecomposeOriginRecords): DecomposeResult<DecomposeSourceFacts> {
  const primary = input.primary, owner = primary.reference.owner;
  const meta = readLifecycleMetaFields(primary);
  if (meta.status === "refused") return decomposeStoreRefusal(meta.refusal);
  if (owner.type !== "work-item" || owner.uid === undefined) {
    return { status: "refused", reason: "source-artifact", class: "recoverable", locus: "origin.uid",
      remedy: { text: "Restore the origin's stored work-item identity, then retry." } };
  }
  const sourceKind = sourceKindFor(primary, meta.result.state);
  if (sourceKind === null) return { status: "refused", reason: "origin-state",
    class: primary.placement?.kind === "completed" ? "terminal" : "recoverable", locus: "State",
    remedy: { text: primary.placement?.kind === "completed" ? "Archived work units cannot begin a cut."
      : `Run ${renderV3DecomposeArgv(["arc", "reopen", owner.name])} for an Integrating origin, then ${renderV3DecomposeArgv(["arc", "deactivate", owner.name])} for a retirement; or ${renderV3DecomposeArgv(decomposeDiscardArgv(owner.name))} to discard an in-flight cut.` } };
  const profile = decomposePlanningProfile(input, meta.result);
  if (profile.status === "refused") return profile;
  const units = sourceUnits(input, sourceKind, profile.result);
  if (units.status === "refused") return units;
  return { status: "ok", result: { origin: { slug: SlugSchema.parse(owner.name), uid: owner.uid }, sourceKind,
    planningProfile: profile.result, sourceUnits: units.result } };
}

function sourceKindFor(primary: StoreRecord, state: string | null): DecomposeSourceFacts["sourceKind"] | null {
  if (primary.placement?.kind === "backlog" && (state === "Planning" || state === "Provisional")) return "backlog-stub";
  if (primary.placement?.kind !== "active") return null;
  return state === "Planning" ? "started-planning" : state === "Active" ? "active-origin" : null;
}

function sourceUnits(input: DecomposeOriginRecords, sourceKind: DecomposeSourceFacts["sourceKind"],
  profile: DecomposeSourceFacts["planningProfile"]): DecomposeResult<DecomposeSourceFacts["sourceUnits"]> {
  const units: DecomposeSourceFacts["sourceUnits"] = [];
  for (const artifact of input.artifacts) {
    if (sourceKind === "active-origin" && !profile.sourceDesign.includes(artifact.basename)) continue;
    const scan = scanV3DecomposeContent(artifact.basename, new TextEncoder().encode(artifact.record.content));
    if (scan.status === "rejected") return { status: "refused", reason: "source-artifact", class: "recoverable",
      locus: artifact.basename, message: scan.reason, remedy: { text: "Repair the source artifact at the locus, then retry." } };
    for (const unit of scan.units) units.push({ sourceId: cutSourceId({ sourceLocator: unit.locator }),
      sourceLocator: unit.locator, contentDigest: digestBytes(unit.bytes) });
  }
  units.sort((left, right) => Buffer.compare(Buffer.from(left.sourceId, "utf8"), Buffer.from(right.sourceId, "utf8")));
  if (new Set(units.map(unit => unit.sourceId)).size !== units.length) return { status: "refused",
    reason: "source-unit-duplicate", class: "recoverable", locus: "sourceUnits",
    remedy: { text: "Repair the duplicate source-unit identities, then retry." } };
  return { status: "ok", result: units };
}
