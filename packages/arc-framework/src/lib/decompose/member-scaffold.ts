/** Member metadata and artifact creation plans over acquired decomposition records. */
import type { DecomposeContext } from "./context.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeOriginRecords } from "./acquire-origin.js";
import type { DecomposeTopology } from "./topology.js";
import type { DecomposeDependencyProjection } from "./dependency-projection.js";
import type { DecomposeResult } from "./refusal.js";
import type { Mutation } from "../store/write.js";
import type { RecordReference } from "../store/identity.js";
import { OwnerIdentitySchema, recordReferences } from "../store/identity.js";
import { readLifecycleMetaFields } from "../store/lifecycle-write.js";
import { renderMetaFile, type MetaRenderOverrides } from "../store/kinds/meta/writers.js";
import { MetaPrioritySchema } from "../active/meta-schema.js";
import { checkDecomposeScaffoldSource } from "./source-guards.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { decomposeMapRuleRefusal } from "./map-rule-refusal.js";
import { copyDecomposeArtifact } from "./scaffold-copy.js";

type Member = Extract<CutMap["authoring"]["destinations"][number], { kind: "new-member" }>;

/** Created records grouped by the member they scaffold. */
export interface DecomposeMemberScaffold {
  destinationId: string;
  slug: string;
  primary: RecordReference;
  copies: readonly { basename: string; reference: RecordReference }[];
}
/** One additive contribution, retaining member coordinates for its report. */
export interface DecomposeMemberScaffolds { members: readonly DecomposeMemberScaffold[]; writes: readonly Mutation[] }

/** Prepare member seeds and copied planning artifacts without applying writes. */
export function planDecomposeMembers(ctx: DecomposeContext, map: CutMap, acquired: DecomposeOriginRecords,
  topology: DecomposeTopology, dependencies: DecomposeDependencyProjection): DecomposeResult<DecomposeMemberScaffolds> {
  const fields = readLifecycleMetaFields(acquired.primary);
  if (fields.status === "refused") return decomposeStoreRefusal(fields.refusal);
  const invalid = checkDecomposeScaffoldSource(acquired, fields.result, map.machine.planningProfile);
  if (invalid !== undefined) return invalid;
  if (fields.result.owner === null || fields.result.origin === null) return decomposeMapRuleRefusal("source-artifact", "Owner / Origin",
    "Restore the origin's Owner and Origin before copying their values, then retry.");
  const inherited: MetaRenderOverrides = { owner: fields.result.owner, priority: MetaPrioritySchema.parse(fields.result.priority),
    origin: fields.result.origin };
  const members: DecomposeMemberScaffold[] = [], writes: Mutation[] = [];
  for (const destination of map.authoring.destinations) {
    if (destination.kind !== "new-member") continue;
    const planned = scaffoldMember(ctx, map, acquired, destination, topology, dependencies, inherited);
    if (planned.status === "refused") return planned;
    members.push(planned.result.member);
    writes.push(...planned.result.writes);
  }
  return { status: "ok", result: { members, writes } };
}

function scaffoldMember(ctx: DecomposeContext, map: CutMap, acquired: DecomposeOriginRecords, destination: Member, topology: DecomposeTopology,
  dependencies: DecomposeDependencyProjection, inherited: MetaRenderOverrides): DecomposeResult<{ member: DecomposeMemberScaffold; writes: Mutation[] }> {
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: destination.slug });
  const primary = recordReferences["work-item/meta"](owner);
  const copies: DecomposeMemberScaffold["copies"][number][] = [], writes: Mutation[] = [];
  const design: string[] = [];
  for (const basename of [...map.machine.planningProfile.sourceDesign, ...optionalCopies(map, destination)]) {
    const copied = copyDecomposeArtifact(ctx, acquired, owner, basename);
    if (copied.status === "refused") return copied;
    copies.push({ basename: copied.result.basename, reference: copied.result.reference });
    writes.push(copied.result.write);
    if (map.machine.planningProfile.sourceDesign.includes(basename)) design.push(copied.result.basename);
  }
  const workflow = map.machine.planningProfile.kind === "draft" ? "draft-design" : "generate-tasks";
  const seed = dependencies.members.find(member => member.destinationId === destination.destinationId);
  if (seed === undefined) return decomposeMapRuleRefusal("authoring-identity", destination.destinationId,
    "Restore the member's dependency projection, then retry.");
  writes.unshift({ action: "put", reference: primary, expected: null, placement: { kind: "backlog", commitment: "planned" },
    content: renderMetaFile(destination.slug, { ...inherited, state: "Planning", workClass: destination.workClass,
      cohort: topology.memberCohort, design, dependsOn: [...seed.dependsOn],
      currentWorkflow: workflow, nextAction: `Begin ${workflow}` }) });
  return { status: "ok", result: { member: { destinationId: destination.destinationId, slug: destination.slug, primary, copies }, writes } };
}

function optionalCopies(map: CutMap, destination: Member): string[] {
  return (["tasks", "notes"] as const).filter(role => map.authoring.sourceAllocations.some(allocation =>
    allocation.disposition.kind === "target" && allocation.disposition.destinationId === destination.destinationId
    && allocation.disposition.targetLocator.artifact === `${role}-${destination.slug}.md`))
    .map(role => `${role}-${map.machine.origin.slug}.md`);
}
