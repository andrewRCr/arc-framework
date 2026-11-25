/** Observe current record protection and the local destination where an edit can be applied. */
import type { ProjectionProtectionEvidence } from "./protection-evidence.js";
import { markStoreRefusal } from "./refusal-mark.js";
import type { GitExec } from "../../git/exec.js";
import type { Slug } from "../../kernel/index.js";
import type { Store } from "../contract.js";
import type { StoreRecord } from "../read.js";
import { recordReferences, type RecordReference } from "../identity.js";
import type { RefusedMark } from "./index-schema.js";
import { readProjectionEditRights, type ProjectionEditRights } from "./rights.js";
import { createLocusPorts } from "../../locus/lifecycle-ports.js";
import { ownerHolderRequest, type UnboundHoldingCheckout } from "../../work-unit/locus-ports.js";
import { nativeRefusalReport } from "../native-refusal.js";
import { findNativeMarkerlessWorkUnitCheckouts } from "../../locus/markerless-native.js";

/** Current protection for one exact record in the destination checkout. */
export type ProjectionProtection = (record: StoreRecord) => Promise<RefusedMark | null>;
/** Native evidence bound to the checkout whose projected file holds the edit. */
export interface ProjectionProtectionInput { store: Store; checkout: string; identity: Slug; exec: GitExec; verb?: "save" | "write-back"; evidence?: ProjectionProtectionEvidence }

/** Bind fresh protection by default, or use supplied rendering-round observations. */
export function createProjectionProtection(input: ProjectionProtectionInput): ProjectionProtection {
  return record => readProjectionProtection(input, record.reference);
}

/** Re-observe rights and local destination evidence for rendering or persistence. */
export async function readProjectionProtection(input: ProjectionProtectionInput, reference: RecordReference): Promise<RefusedMark | null> {
  try {
    const read = await readProjectionEditRights({ ...input, reference, source: input.evidence?.source, readMarker: input.evidence?.checkouts.readMarker });
    if (read.status === "refused") return markStoreRefusal(read.refusal, input.verb);
    if (read.result.kind === "editable") return null;
    return reference.owner.type === "work-item" ? await workItemProtection(input, read.result) : protectedMark(read.result);
  } catch (error) {
    const native = nativeRefusalReport(error);
    return native?.refusal === undefined ? { reason: error instanceof Error ? error.message : String(error),
      remedy: { text: "Inspect and repair the named ownership or checkout evidence, then retry the edit." } }
      : markStoreRefusal(native.refusal, input.verb);
  }
}

async function workItemProtection(input: ProjectionProtectionInput, rights: Extract<ProjectionEditRights, { kind: "protected" }>): Promise<RefusedMark> {
  const primary = await (input.evidence?.source ?? input.store).read({ reference: recordReferences["work-item/meta"](rights.reference.owner) });
  if (primary.status === "refused") return markStoreRefusal(primary.refusal, input.verb);
  if (primary.result.reference.kind !== "work-item/meta" || primary.result.placement?.kind !== "active") return protectedMark(rights);
  const evidence = input.evidence;
  const holder = await createLocusPorts({ cwd: input.checkout, exec: input.exec, store: input.store, observation: input.evidence?.checkouts,
    listing: evidence === undefined ? undefined : () => evidence.source.list({ family: "work-item", kind: "work-item/meta" }) })
    .findHoldingCheckout(ownerHolderRequest(primary.result));
  if (holder.kind === "unbound") return unboundProtection(holder);
  if (holder.kind === "held") return { reason: `This file belongs to ${rights.owner}; ${holder.path} holds ${primary.result.reference.owner.name}.`,
    remedy: { text: `Apply the edit in ${holder.path}, then run arc save there.` } };
  return rights.reason === "identity" ? protectedMark(rights) : materializationProtection(input, primary.result, rights);
}

async function materializationProtection(input: ProjectionProtectionInput, primary: StoreRecord,
  rights: Extract<ProjectionEditRights, { kind: "protected" }>): Promise<RefusedMark> {
  const paths = await findNativeMarkerlessWorkUnitCheckouts({ ...input, record: primary,
    observation: input.evidence?.checkouts, projectId: input.evidence?.projectId });
  const name = primary.reference.owner.name;
  const command = `arc materialize ${name}${paths.length === 0 ? "" : " --here"}`;
  return { ...protectedMark(rights), remedy: {
    text: paths.length === 0 ? `Run ${command}, then apply the edit in its checkout.`
      : `From ${paths.join(" or ")}, run ${command}, then apply the edit there.`,
    argv: ["arc", "materialize", name, ...(paths.length === 0 ? [] : ["--here"])],
  } };
}

function unboundProtection(holder: UnboundHoldingCheckout): RefusedMark {
  const argv = holder.exits.find(action => action.argv !== undefined)?.argv;
  return { reason: holder.reason, remedy: {
    text: `From ${holder.path}: ${holder.exits.map(action => action.text).join("; ")}.`,
    ...(argv === undefined ? {} : { argv }),
  } };
}

function protectedMark(rights: Extract<ProjectionEditRights, { kind: "protected" }>): RefusedMark {
  const subject = rights.reference.owner.name;
  if (rights.reason === "identity") return {
    reason: `This record belongs to ${rights.owner}; the current identity may not edit it.`,
    remedy: { text: `Have ${rights.owner} apply the edit under their identity, then retry.` },
  };
  if (rights.reason === "checkout") return {
    reason: `The ${rights.reference.kind} for ${subject} is editable only from its owning checkout.`,
    remedy: { text: `Apply the edit in the checkout whose marker claims ${subject}, then save again.` },
  };
  return { reason: `The ${rights.reference.kind} for ${subject} is not editable by hand in its current lifecycle state.`,
    remedy: { text: "Use the record's owning verb, or repair its lifecycle metadata before retrying the edit." } };
}
