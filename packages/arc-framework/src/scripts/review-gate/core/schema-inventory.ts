/** Closed inventory of durable review records whose schemas are owned by later domain modules. */

import type { KernelRegistry } from "../../../lib/kernel/index.js";

export const REVIEW_DURABLE_RECORD_INVENTORY = [
  { id: "review-target", version: 2, owner: "gate-contract" },
  { id: "review-requirement", version: 2, owner: "gate-contract" },
  { id: "review-request", version: 2, owner: "gate-contract" },
  { id: "review-receipt", version: 2, owner: "gate-contract" },
  { id: "review-receipt-ledger", version: 2, owner: "receipt-store" },
  { id: "normalized-finding", version: 2, owner: "finding-settlement" },
  { id: "disposition-set", version: 2, owner: "finding-settlement" },
  { id: "fix-authorization", version: 2, owner: "finding-settlement" },
  { id: "fix-consumption", version: 2, owner: "finding-settlement" },
  { id: "local-review-source", version: 1, owner: "local-source" },
  { id: "approved-disposition-record", version: 1, owner: "advisory-records" },
  { id: "frontline-outcome-record", version: 1, owner: "advisory-records" },
  { id: "review-reduction-projection", version: 1, owner: "advisory-records" },
  {
    id: "review-operation-state",
    version: 1,
    owner: "operation-state",
    variants: ["frontline-run", "review-suspension", "local-review", "lane-progress"],
  },
] as const;

export type ReviewDurableRecordIdentity = (typeof REVIEW_DURABLE_RECORD_INVENTORY)[number]["id"];

const REGISTERED_SCHEMA_IDENTITIES: Partial<Record<ReviewDurableRecordIdentity, string>> = {
  "normalized-finding": "normalized-review-finding",
  "fix-consumption": "fix-authorization-consumption",
};

/**
 * Fail closed when the durable-record inventory and registered schema authority diverge.
 *
 * @param registry - Fully composed review-domain schema registry.
 */
export function assertReviewDurableRecordInventory(registry: KernelRegistry): void {
  for (const record of REVIEW_DURABLE_RECORD_INVENTORY) {
    const schemaId = REGISTERED_SCHEMA_IDENTITIES[record.id] ?? record.id;
    const registered = registry.meta(schemaId);
    if (registered === undefined) {
      throw new Error(`${record.id} inventory entry has no registered schema '${schemaId}'`);
    }
    if (registered.version !== record.version) {
      throw new Error(
        `${record.id} inventory version ${record.version} does not match registered version ${registered.version}`,
      );
    }
    if ("variants" in record) {
      for (const variant of record.variants) {
        const variantSchemaId = `${variant}-state`;
        const registeredVariant = registry.meta(variantSchemaId);
        if (registeredVariant === undefined) {
          throw new Error(`${record.id} variant '${variant}' has no registered schema '${variantSchemaId}'`);
        }
        if (registeredVariant.version !== record.version) {
          const message = [
            `${record.id} variant '${variant}' version ${record.version}`,
            `does not match registered version ${registeredVariant.version}`,
          ].join(" ");
          throw new Error(message);
        }
      }
    }
  }
}
