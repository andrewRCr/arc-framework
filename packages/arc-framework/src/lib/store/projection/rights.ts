/** Record-based edit rights shared by persistence, protection, and adoption. */
import { SlugSchema, WorkUnitStateSchema, type Slug } from "../../kernel/index.js";
import type { Store } from "../contract.js";
import { recordReferences, sameOwner, type RecordReference } from "../identity.js";
import type { Remedy, StoreResult } from "../refusal.js";
import { ParsedMetaRecordSchema, type ParsedMetaRecord } from "../../active/meta-schema.js";
import { deserializeTransientIdentityRecord } from "../../errand/identity-record.js";
import type { StoreRecord } from "../read.js";
import { readClaimedCurrentWorkUnit } from "../current-work-unit-marker.js";
import { nativeRefusalReport } from "../native-refusal.js";
import { parseMetaRecord } from "../../active/meta-reader.js";

/** Exact subject and editing context, independent of the file's projected address. */
export interface ProjectionEditRightsInput {
  readonly store: Store;
  readonly reference: RecordReference;
  readonly identity: Slug;
  readonly checkout: string;
}

/** Authorization facts kept separate from the notice or refusal that presents them. */
export type ProjectionEditRights = { readonly kind: "editable" } | {
  readonly kind: "protected";
  readonly reason: "identity" | "checkout" | "verb";
  readonly reference: RecordReference;
  readonly owner: Slug | null;
};

/** Decide edit rights from the exact record and the checkout holding its edit. */
export async function readProjectionEditRights(input: ProjectionEditRightsInput): Promise<StoreResult<ProjectionEditRights>> {
  if (input.reference.kind === "cohort/document" || input.reference.kind === "project-inbox/inbox") {
    return { status: "ok", result: { kind: "editable" } };
  }
  if (input.reference.owner.type === "person") {
    return input.reference.owner.name === input.identity ? { status: "ok", result: { kind: "editable" } }
      : protectedRights(input, "identity", input.reference.owner.name);
  }
  if (input.reference.owner.type !== "work-item") return protectedRights(input, "verb", null);
  const primary = await input.store.read({ reference: recordReferences["work-item/meta"](input.reference.owner) });
  if (primary.status === "refused") return primary;
  return primary.result.reference.kind === "work-item/record" ? errandRights(input, primary.result) : workUnitRights(input, primary.result);
}

async function workUnitRights(input: ProjectionEditRightsInput, primary: StoreRecord): Promise<StoreResult<ProjectionEditRights>> {
  const observed = metaFields(primary);
  if (observed.status === "refused") return observed;
  const fields = observed.result;
  if (input.reference.kind !== "work-item/inbound" && primary.placement?.kind === "backlog" && fields.state === "Planning") {
    return { status: "ok", result: { kind: "editable" } };
  }
  const owner = SlugSchema.safeParse(fields.owner);
  if (!owner.success) return malformedRights(primary.reference, "Metadata owner is missing or malformed.");
  if (owner.data !== input.identity) return protectedRights(input, "identity", owner.data);
  if (input.reference.kind === "work-item/inbound") return { status: "ok", result: { kind: "editable" } };
  if (primary.placement?.kind === "completed") return { status: "ok", result: { kind: "editable" } };
  if (primary.placement?.kind === "active") {
    if (input.reference.kind === "work-item/meta" || input.reference.kind === "work-item/task-list") {
      return checkoutRights(input, owner.data);
    }
    return { status: "ok", result: { kind: "editable" } };
  }
  return protectedRights(input, "verb", null);
}

function metaFields(primary: StoreRecord): StoreResult<ParsedMetaRecord> {
  try {
    const parsed = ParsedMetaRecordSchema.safeParse(primary.fields);
    const fields = parsed.success ? parsed.data : parseMetaRecord(primary.content);
    if (!WorkUnitStateSchema.safeParse(fields.state).success) return malformedRights(primary.reference,
      `Metadata holds unrecognized State ${JSON.stringify(fields.state)}.`);
    return { status: "ok", result: fields };
  } catch (error) {
    return malformedRights(primary.reference, `Unreadable metadata: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function malformedRights(reference: RecordReference, condition: string): StoreResult<never> {
  return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference, rule: "projection.edit-rights",
    condition: `Cannot establish edit rights for ${reference.owner.name}: ${condition}`,
    remedy: { text: "Repair the record's ownership and lifecycle metadata, then retry the edit." } } };
}

async function checkoutRights(input: ProjectionEditRightsInput, owner: Slug): Promise<StoreResult<ProjectionEditRights>> {
  const warnings: string[] = [];
  const claim = await readClaimedCurrentWorkUnit({ cwd: input.checkout, store: input.store }, warnings);
  if (claim.kind === "absent" && claim.cause !== undefined) {
    const native = nativeRefusalReport(claim.cause);
    if (native?.refusal !== undefined) return { status: "refused", refusal: native.refusal };
    throw claim.cause;
  }
  if (claim.kind === "unbound") {
    const argv = claim.exits.find(action => action.argv !== undefined)?.argv;
    return unavailableCheckout(input, claim.reason, { text: `From ${input.checkout}: ${claim.exits.map(action => action.text).join("; ")}.`,
      ...(argv === undefined ? {} : { argv }) });
  }
  if (warnings.length > 0) return unavailableCheckout(input, warnings.join(" "), {
    text: "Inspect and repair the named checkout ownership evidence, then retry.",
  });
  return claim.kind === "present" && sameOwner(claim.record.reference.owner, input.reference.owner)
    ? { status: "ok", result: { kind: "editable" } } : protectedRights(input, "checkout", owner);
}

function unavailableCheckout(input: ProjectionEditRightsInput, condition: string, remedy: Remedy): StoreResult<ProjectionEditRights> {
  return { status: "refused", refusal: { code: "checkout-not-writable", class: "recoverable", checkout: input.checkout, condition, remedy } };
}

function errandRights(input: ProjectionEditRightsInput, primary: StoreRecord): StoreResult<ProjectionEditRights> {
  const decoded = deserializeTransientIdentityRecord(primary.content, primary.reference.owner.name);
  if (decoded.kind !== "valid" || decoded.record.kind !== "errand" || decoded.record.purpose !== "errand") {
    return protectedRights(input, "verb", null);
  }
  if (decoded.record.owner === undefined) return malformedRights(primary.reference, "The Errand owner is missing.");
  if (decoded.record.owner !== input.identity) return protectedRights(input, "identity", decoded.record.owner);
  return input.reference.kind === "work-item/description" || input.reference.kind === "work-item/inbound"
    ? { status: "ok", result: { kind: "editable" } } : protectedRights(input, "verb", decoded.record.owner);
}

function protectedRights(input: ProjectionEditRightsInput, reason: "identity" | "checkout" | "verb", owner: Slug | null): StoreResult<ProjectionEditRights> {
  return { status: "ok", result: { kind: "protected", reason, reference: input.reference, owner } };
}
