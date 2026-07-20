/** Closed inventory of durable review records whose schemas are owned by later domain modules. */

export const REVIEW_DURABLE_RECORD_INVENTORY = [
  { id: "review-target", version: 2, owner: "gate-contract" },
  { id: "review-requirement", version: 2, owner: "gate-contract" },
  { id: "review-request", version: 2, owner: "gate-contract" },
  { id: "review-receipt", version: 2, owner: "gate-contract" },
  { id: "review-receipt-ledger", version: 2, owner: "receipt-store" },
  { id: "review-applicability", version: 2, owner: "gate-contract" },
  { id: "normalized-finding", version: 2, owner: "finding-settlement" },
  { id: "disposition-set", version: 2, owner: "finding-settlement" },
  { id: "fix-authorization", version: 2, owner: "finding-settlement" },
  { id: "fix-consumption", version: 2, owner: "finding-settlement" },
  {
    id: "review-operation-state",
    version: 1,
    owner: "operation-state",
    variants: ["frontline-run", "review-suspension"],
  },
] as const;

export type ReviewDurableRecordIdentity = (typeof REVIEW_DURABLE_RECORD_INVENTORY)[number]["id"];
