/** Public projection of complete v3 transient identities. */

import { z } from "zod";

import {
  LocusGitOidSchema,
  LocusOpaqueTextSchema,
  LocusTokenSchema,
} from "./limits.js";

/** Exact change-request coordinates retained by an awaiting identity. */
export const LocusChangeRequestV1Schema = z.strictObject({
  repositoryRef: LocusOpaqueTextSchema,
  hostRef: LocusOpaqueTextSchema,
  baseRef: LocusOpaqueTextSchema,
  headRef: LocusOpaqueTextSchema,
  headSha: LocusGitOidSchema,
});

const ordinaryBase = {
  kind: z.literal("errand"),
  key: LocusOpaqueTextSchema,
  claimId: LocusTokenSchema,
  protection: z.literal("full"),
  branch: LocusOpaqueTextSchema,
  purpose: z.literal("errand"),
};
const descriptionOrigin = {
  origin: z.literal("description"), originEntry: z.null(),
};
const inboxOrigin = {
  origin: z.literal("inbox"), originEntry: LocusOpaqueTextSchema,
};
const openState = { state: z.literal("open"), savedHead: z.null(), changeRequest: z.null() };
const pausedState = { state: z.literal("paused"), savedHead: LocusGitOidSchema, changeRequest: z.null() };
const awaitingState = {
  state: z.literal("awaiting-merge"), savedHead: z.null(), changeRequest: LocusChangeRequestV1Schema,
};

const ordinaryErrands = [descriptionOrigin, inboxOrigin].flatMap((origin) => [
  z.strictObject({ ...ordinaryBase, ...origin, ...openState }),
  z.strictObject({ ...ordinaryBase, ...origin, ...pausedState }),
  z.strictObject({ ...ordinaryBase, ...origin, ...awaitingState }),
]);

const routingBase = {
  kind: z.literal("errand"),
  key: LocusOpaqueTextSchema,
  claimId: LocusTokenSchema,
  protection: z.literal("full"),
  branch: LocusOpaqueTextSchema,
  purpose: z.literal("housekeep-routing"),
};
const routingErrands = [
  z.strictObject({ ...routingBase, ...openState }),
  z.strictObject({ ...routingBase, ...awaitingState }),
];

const groomBase = {
  kind: z.literal("groom"),
  key: LocusOpaqueTextSchema,
  claimId: LocusTokenSchema,
  purpose: z.null(),
  anchorStub: LocusOpaqueTextSchema,
  members: z.array(LocusOpaqueTextSchema).min(1),
  openedBaseHead: LocusGitOidSchema,
};
const groomSchemas = [
  z.strictObject({
    ...groomBase, protection: z.literal("full"), branch: LocusOpaqueTextSchema,
    state: z.literal("open"), savedHead: z.null(), changeRequest: z.null(),
  }),
  z.strictObject({
    ...groomBase, protection: z.literal("full"), branch: LocusOpaqueTextSchema,
    ...awaitingState,
  }),
  z.strictObject({
    ...groomBase, protection: z.literal("partial"), branch: z.null(),
    state: z.literal("open"), savedHead: z.null(), changeRequest: z.null(),
  }),
].map((schema) => schema.superRefine((value, context) => {
  const sorted = [...value.members].sort(compareUtf8);
  if (!value.members.includes(value.anchorStub)
    || new Set(value.members).size !== value.members.length
    || sorted.some((member, index) => member !== value.members[index])) {
    context.addIssue({ code: "custom", path: ["members"], message: "Members must be unique, byte-sorted, and contain the anchor" });
  }
  if (value.key !== `groom-${value.anchorStub}`) {
    context.addIssue({ code: "custom", path: ["key"], message: "Groom key must derive from anchor" });
  }
}));

/** Complete public transient identity projection. */
export const LocusIdentityV1Schema = z.union([
  ...ordinaryErrands,
  ...routingErrands,
  ...groomSchemas,
]);

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

export type LocusChangeRequestV1 = z.infer<typeof LocusChangeRequestV1Schema>;
export type LocusIdentityV1 = z.infer<typeof LocusIdentityV1Schema>;
