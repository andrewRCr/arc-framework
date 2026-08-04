/** Composition entrypoint for review-domain schemas over a caller-owned kernel registry. */

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import { registerChangeFactSchemas } from "../../../lib/change-facts.schema.js";
import { registerReviewGateV2Schemas } from "./gate-contract-v2-schema.js";
import { registerFindingRecordSchemas } from "./finding-records.js";
import { registerFixAuthorizationSchemas } from "./fix-authorization-records.js";
import { registerDispositionRecordSchemas } from "./disposition-records.js";
import { registerReviewResponseSchemas } from "./response-plan-schema.js";
import { registerReviewOperationStateSchemas } from "./operation-state-schema.js";
import { registerLocalReviewSourceSchemas } from "./local-review-source.js";
import { registerAdvisoryRecordSchemas } from "./advisory-records.js";
import { registerReviewCommandEnvelopeSchemas } from "./review-command-envelope.js";
import { registerMergeLockCommandEnvelopeSchemas } from "./merge-lock-command-envelope.js";
import { registerReviewChunkingCommandSchemas } from "./review-chunking-command-schema.js";
import { registerFrontlineOutcomeSchema } from "../policy/frontline-outcome.js";
import { registerLocalReviewPolicySchemas } from "../policy/local-review-policy.js";
import { registerStandardReviewProjectionSchema } from "../policy/standard-review-projection-schema.js";
import { registerStandardReviewSchema } from "../policy/standard-review-schema.js";
import { registerProjectRoutingPromotionSchema } from "../policy/project-promotion-schema.js";
import { registerReviewAssuranceSchemas } from "../policy/assurance-schema.js";
import { registerReviewRoutingSchemas } from "../policy/routing-schema.js";
import { registerReviewPrimitiveSchemas } from "./review-primitives.js";
import { registerForwardLifecycleTailSchema } from "./lifecycle-tail.js";
import { registerReviewApplicabilitySchemas } from "./applicability.js";
import { registerForwardReceiptLedgerSchema } from "./forward-receipt-ledger-schema.js";
import { registerSeverityGatingPolicySchema } from "./severity-gating-policy.js";
import { assertReviewDurableRecordInventory } from "./schema-inventory.js";

/** Compose every currently implemented review schema into a fresh kernel registry. */
export function registerReviewDomainSchemas(registry: KernelRegistry): KernelRegistry {
  registerChangeFactSchemas(registry);
  registerReviewApplicabilitySchemas(registry);
  registerReviewGateV2Schemas(registry);
  registerFindingRecordSchemas(registry);
  registerFixAuthorizationSchemas(registry);
  registerDispositionRecordSchemas(registry);
  registerSeverityGatingPolicySchema(registry);
  registerReviewResponseSchemas(registry);
  registerReviewOperationStateSchemas(registry);
  registerLocalReviewSourceSchemas(registry);
  registerAdvisoryRecordSchemas(registry);
  registerReviewCommandEnvelopeSchemas(registry);
  registerMergeLockCommandEnvelopeSchemas(registry);
  registerReviewChunkingCommandSchemas(registry);
  registerForwardReceiptLedgerSchema(registry);
  registerForwardLifecycleTailSchema(registry);
  registerReviewPrimitiveSchemas(registry);
  registerReviewAssuranceSchemas(registry);
  registerReviewRoutingSchemas(registry);
  registerProjectRoutingPromotionSchema(registry);
  registerStandardReviewSchema(registry);
  registerStandardReviewProjectionSchema(registry);
  registerLocalReviewPolicySchemas(registry);
  registerFrontlineOutcomeSchema(registry);
  assertReviewDurableRecordInventory(registry);
  return registry;
}
