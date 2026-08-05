/** Deterministic Markdown codec and integrity boundary for delivery authoring maps. */

import { z } from "zod";

import { canonicalize, SlugSchema } from "../kernel/index.js";
import {
  DeliveryAuthoringSnapshotV1Schema,
  type DeliveryAuthoringSnapshotV1,
} from "./authoring-schema.js";
import { DeliveryOpaqueIdSchema } from "./schema.js";

const MACHINE_START = "<!-- arc:delivery-authoring-machine:start -->";
const MACHINE_END = "<!-- arc:delivery-authoring-machine:end -->";
const SLOTS_START = "<!-- arc:delivery-authoring-slots:start -->";
const SLOTS_END = "<!-- arc:delivery-authoring-slots:end -->";

const NonEmptyTextSchema = z.string().trim().min(1);
const ProjectionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("wu-integration-target") }),
  z.strictObject({ kind: z.literal("stack-to-main") }),
]);
const BoundarySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("phase-aligned") }),
  z.strictObject({
    kind: z.literal("explicit"),
    segments: z.array(z.strictObject({
      chunkKey: SlugSchema,
      sourceIds: z.array(DeliveryOpaqueIdSchema).min(1),
    })).min(1),
  }),
]);
const MemberSlotSchema = z.strictObject({
  status: z.enum(["live", "landed"]),
  chunkKey: SlugSchema,
  title: NonEmptyTextSchema,
  contract: NonEmptyTextSchema,
  designElementIds: z.array(DeliveryOpaqueIdSchema),
  mainlineLandability: z.enum(["independently-landable", "integration-only"]),
});
const SeamSlotSchema = z.strictObject({
  seamKey: SlugSchema,
  title: NonEmptyTextSchema,
  acceptance: NonEmptyTextSchema,
  incidentChunkKeys: z.array(SlugSchema).min(2),
  designElementIds: z.array(DeliveryOpaqueIdSchema),
});

/** Complete authored judgments after every starter slot has been filled. */
export const DeliveryAuthoringSlotsV1Schema = z.strictObject({
  projection: ProjectionSchema,
  boundary: BoundarySchema,
  members: z.array(MemberSlotSchema).min(1),
  seams: z.array(SeamSlotSchema),
});
export type DeliveryAuthoringSlotsV1 = z.infer<typeof DeliveryAuthoringSlotsV1Schema>;

const LooseMemberSlotSchema = z.strictObject({
  status: MemberSlotSchema.shape.status.nullable(),
  chunkKey: MemberSlotSchema.shape.chunkKey.nullable(),
  title: MemberSlotSchema.shape.title.nullable(),
  contract: MemberSlotSchema.shape.contract.nullable(),
  designElementIds: MemberSlotSchema.shape.designElementIds.nullable(),
  mainlineLandability: MemberSlotSchema.shape.mainlineLandability.nullable(),
});
const LooseSeamSlotSchema = z.strictObject({
  seamKey: SeamSlotSchema.shape.seamKey.nullable(),
  title: SeamSlotSchema.shape.title.nullable(),
  acceptance: SeamSlotSchema.shape.acceptance.nullable(),
  incidentChunkKeys: SeamSlotSchema.shape.incidentChunkKeys.nullable(),
  designElementIds: SeamSlotSchema.shape.designElementIds.nullable(),
});
const LooseSlotsSchema = z.strictObject({
  projection: ProjectionSchema.nullable(),
  boundary: BoundarySchema.nullable(),
  members: z.array(LooseMemberSlotSchema).nullable(),
  seams: z.array(LooseSeamSlotSchema).nullable(),
});

const DeliveryAuthoringMachineV1Schema = DeliveryAuthoringSnapshotV1Schema.omit({
  candidatePlanDigest: true,
  candidateProjectionDigest: true,
});
type DeliveryAuthoringMachineV1 = z.infer<typeof DeliveryAuthoringMachineV1Schema>;

/** Parsed map before the machine and slot material is checked against its snapshot. */
export type ParseDeliveryAuthoringMapResult =
  | { readonly status: "parsed"; readonly machine: unknown; readonly slots: unknown }
  | { readonly status: "refused"; readonly reason: "map-malformed" };

/** Typed integrity refusal emitted before record construction. */
export type ValidateDeliveryAuthoringMapResult =
  | { readonly status: "valid"; readonly slots: DeliveryAuthoringSlotsV1 }
  | {
    readonly status: "refused";
    readonly reason:
      | "map-malformed"
      | "slot-unfilled"
      | "derived-value-mutated"
      | "identity-sequence-reordered";
  };

function machineMaterial(snapshot: DeliveryAuthoringSnapshotV1): DeliveryAuthoringMachineV1 {
  const { candidatePlanDigest, candidateProjectionDigest, ...machine } = snapshot;
  void candidatePlanDigest;
  void candidateProjectionDigest;
  return DeliveryAuthoringMachineV1Schema.parse(machine);
}

function jsonBlock(start: string, value: unknown, end: string): string {
  return `${start}\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n${end}`;
}

function starterSlots(): unknown {
  return { projection: null, boundary: null, members: null, seams: null };
}

/** Render one map with immutable machine material and an explicit author-slot object. */
export function renderDeliveryAuthoringMap(
  snapshot: DeliveryAuthoringSnapshotV1,
  slots: unknown = starterSlots(),
): string {
  return [
    "# Delivery Plan Authoring Map",
    "",
    "The machine section is CLI-owned. Edit only the author slots, then run `arc delivery compose`.",
    "",
    jsonBlock(MACHINE_START, machineMaterial(snapshot), MACHINE_END),
    "",
    "## Author slots",
    "",
    jsonBlock(SLOTS_START, slots, SLOTS_END),
    "",
  ].join("\n");
}

function extractJsonBlock(
  content: string,
  start: string,
  end: string,
): { readonly status: "ok"; readonly value: unknown } | { readonly status: "refused" } {
  const prefix = `${start}\n\`\`\`json\n`;
  const suffix = `\n\`\`\`\n${end}`;
  if (content.indexOf(prefix) === -1 || content.indexOf(prefix) !== content.lastIndexOf(prefix)) {
    return { status: "refused" };
  }
  const from = content.indexOf(prefix) + prefix.length;
  const to = content.indexOf(suffix, from);
  if (to === -1 || to !== content.lastIndexOf(suffix)) return { status: "refused" };
  try {
    return { status: "ok", value: JSON.parse(content.slice(from, to)) as unknown };
  } catch {
    return { status: "refused" };
  }
}

/** Parse both exact sentinel-bounded JSON blocks without interpreting authored slots. */
export function parseDeliveryAuthoringMap(content: string): ParseDeliveryAuthoringMapResult {
  const normalized = content.replaceAll("\r\n", "\n");
  const machine = extractJsonBlock(normalized, MACHINE_START, MACHINE_END);
  const slots = extractJsonBlock(normalized, SLOTS_START, SLOTS_END);
  return machine.status === "refused" || slots.status === "refused"
    ? { status: "refused", reason: "map-malformed" }
    : { status: "parsed", machine: machine.value, slots: slots.value };
}

function sequenceDisposition(
  actual: readonly string[],
  expected: readonly string[],
): "equal" | "reordered" | "mutated" {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return "equal";
  const sort = (values: readonly string[]) => [...values].sort((left, right) => (
    Buffer.from(left).compare(Buffer.from(right))
  ));
  return JSON.stringify(sort(actual)) === JSON.stringify(sort(expected))
    ? "reordered"
    : "mutated";
}

function hasUnfilledSlot(slots: z.infer<typeof LooseSlotsSchema>): boolean {
  if (slots.projection === null || slots.boundary === null
    || slots.members === null || slots.members.length === 0 || slots.seams === null) return true;
  return slots.members.some((member) => Object.values(member).some((value) => value === null))
    || slots.seams.some((seam) => Object.values(seam).some((value) => value === null));
}

function suppliesDerivedSeamOwner(slots: unknown): boolean {
  if (typeof slots !== "object" || slots === null || Array.isArray(slots)) return false;
  const seams = (slots as Record<string, unknown>)["seams"];
  return Array.isArray(seams) && seams.some((seam: unknown) => {
    if (typeof seam !== "object" || seam === null || Array.isArray(seam)) return false;
    const record = seam as Record<string, unknown>;
    return Object.hasOwn(record, "ownerDeliverableId") || Object.hasOwn(record, "ownerChunkKey");
  });
}

/** Compare map material with the canonical snapshot and return only complete authored judgments. */
export function validateDeliveryAuthoringMap(
  content: string,
  snapshot: DeliveryAuthoringSnapshotV1,
): ValidateDeliveryAuthoringMapResult {
  const parsed = parseDeliveryAuthoringMap(content);
  if (parsed.status === "refused") return parsed;

  const actualMachine = DeliveryAuthoringMachineV1Schema.safeParse(parsed.machine);
  if (!actualMachine.success) return { status: "refused", reason: "derived-value-mutated" };
  const expectedMachine = machineMaterial(snapshot);
  const sequences = [
    [actualMachine.data.source.identitySequence, expectedMachine.source.identitySequence],
    [actualMachine.data.identityOrder.designArtifactIds, expectedMachine.identityOrder.designArtifactIds],
    [actualMachine.data.identityOrder.designElementIds, expectedMachine.identityOrder.designElementIds],
    [actualMachine.data.identityOrder.taskIds, expectedMachine.identityOrder.taskIds],
    [actualMachine.data.identityOrder.sourceIds, expectedMachine.identityOrder.sourceIds],
  ] as const;
  for (const [actual, expected] of sequences) {
    const disposition = sequenceDisposition(actual, expected);
    if (disposition === "reordered") {
      return { status: "refused", reason: "identity-sequence-reordered" };
    }
    if (disposition === "mutated") {
      return { status: "refused", reason: "derived-value-mutated" };
    }
  }
  if (canonicalize(actualMachine.data) !== canonicalize(expectedMachine)) {
    return { status: "refused", reason: "derived-value-mutated" };
  }
  if (suppliesDerivedSeamOwner(parsed.slots)) {
    return { status: "refused", reason: "derived-value-mutated" };
  }

  const looseSlots = LooseSlotsSchema.safeParse(parsed.slots);
  if (!looseSlots.success) return { status: "refused", reason: "map-malformed" };
  if (hasUnfilledSlot(looseSlots.data)) return { status: "refused", reason: "slot-unfilled" };
  const complete = DeliveryAuthoringSlotsV1Schema.safeParse(looseSlots.data);
  return complete.success
    ? { status: "valid", slots: complete.data }
    : { status: "refused", reason: "map-malformed" };
}
