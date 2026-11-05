/** Shared slug-or-UID selection with caller-specific primary-kind admission. */
import { z } from "zod";
import { SlugSchema, type Slug } from "../kernel/index.js";
import type { Store } from "./contract.js";
import type { RecordReference } from "./identity.js";
import type { StoreRecord } from "./read.js";
import type { Remedy, StoreRefusal } from "./refusal.js";
import { readWorkItemByUid, type UidPrimaryKind } from "./work-item-uid.js";

/** The primary types admitted by one subject-selecting verb. */
export type SubjectOperandRule = "rename" | "cohort" | "errand";
/** Invocation policy over an already validated CLI operand. */
export interface SubjectOperandInput {
  operand: string;
  primaryKinds: readonly UidPrimaryKind[];
  typeRule: SubjectOperandRule;
  resolveSlug: boolean;
}
/** Selection retains the original operand and every provider refusal. */
export type SubjectOperandResult =
  | { status: "selected"; primary: StoreRecord; selectedBy: "uid" | "slug"; operand: string }
  | { status: "slug"; slug: Slug; operand: string }
  | { status: "unselected"; condition: string; remedy: Remedy }
  | { status: "refused"; refusal: StoreRefusal };

/** Resolve a subject while retaining the invocation's operand and complete recovery evidence. */
export async function resolveSubjectOperand(store: Store, input: SubjectOperandInput): Promise<SubjectOperandResult> {
  const uid = z.uuid().safeParse(input.operand);
  if (!uid.success && !input.resolveSlug) return { status: "slug", slug: SlugSchema.parse(input.operand), operand: input.operand };
  const selection = uid.success ? await uidReference(store, uid.data.toLowerCase(), input.primaryKinds)
    : await slugReference(store, SlugSchema.parse(input.operand));
  if (selection.status !== "reference") return selection;
  const read = await store.read({ reference: selection.reference });
  if (read.status === "refused") return read;
  const refusal = typeRefusal(read.result, input.typeRule);
  return refusal === undefined
    ? { status: "selected", primary: read.result, selectedBy: selection.selectedBy, operand: input.operand }
    : { status: "refused", refusal };
}

type ReferenceSelection = { status: "reference"; reference: RecordReference; selectedBy: "uid" | "slug" }
  | Extract<SubjectOperandResult, { status: "unselected" | "refused" }>;

async function uidReference(store: Store, uid: string, kinds: readonly UidPrimaryKind[]): Promise<ReferenceSelection> {
  const selected = await readWorkItemByUid(store, uid, kinds);
  if (selected.status === "refused") return selected;
  if (selected.status === "incomplete") return { status: "unselected", condition: selected.condition, remedy: selected.remedy };
  return selected.result === null ? { status: "unselected", condition: `UID ${uid} does not select an owner.`,
    remedy: { text: `Pull store state or check UID ${uid}, then retry.` } }
    : { status: "reference", reference: selected.result.reference, selectedBy: "uid" };
}

async function slugReference(store: Store, slug: Slug): Promise<ReferenceSelection> {
  const selected = await store.lookup({ kind: "slug", slug });
  return selected.status === "refused" ? selected
    : { status: "reference", reference: selected.result.reference, selectedBy: "slug" };
}

const admittedKinds: Record<SubjectOperandRule, readonly UidPrimaryKind[]> = {
  rename: ["work-item/meta", "cohort/document"], cohort: ["cohort/document"], errand: ["work-item/record"],
};

function typeRefusal(primary: StoreRecord, rule: SubjectOperandRule): StoreRefusal | undefined {
  if (admittedKinds[rule].some(kind => kind === primary.reference.kind)) return undefined;
  const owner = primary.reference.owner, operand = owner.type === "person" ? owner.name : owner.uid ?? owner.name;
  const remedy = primary.reference.kind === "work-item/record"
    ? { text: `Use arc errand close ${operand}, or name a subject admitted by this verb.`, argv: ["arc", "errand", "close", operand] }
    : { text: "Use the work-unit lifecycle verbs, or name a subject admitted by this verb." };
  return { code: "record-malformed", class: "recoverable", reference: primary.reference, rule: `identity.${rule}-subject`,
    condition: `${primary.reference.kind} '${owner.name}' is not an admitted ${rule} subject.`, remedy };
}
