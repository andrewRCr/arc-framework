/** Composition entrypoint for review-domain schemas over a caller-owned kernel registry. */

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import { registerChangeFactSchemas } from "../../../lib/change-facts.schema.js";
import { registerReviewGateV2Schemas } from "./gate-contract-v2-schema.js";
import { registerFindingRecordSchemas } from "./finding-records.js";
import { registerFixAuthorizationSchemas } from "./fix-authorization-records.js";
import { registerDispositionRecordSchemas } from "./disposition-records.js";
import { registerReviewResponseSchemas } from "./response-plan-schema.js";
import { registerReviewOperationStateSchemas } from "./operation-state-schema.js";
import { registerIndependentAnalysisProjectionSchema } from "../policy/independent-analysis-projection-schema.js";
import { registerIndependentAnalysisSchema } from "../policy/independent-analysis-schema.js";
import { registerProjectRoutingPromotionSchema } from "../policy/project-promotion-schema.js";
import { registerReviewAssuranceSchemas } from "../policy/assurance-schema.js";
import { registerReviewRoutingSchemas } from "../policy/routing-schema.js";
import { registerReviewPrimitiveSchemas } from "./review-primitives.js";
import { registerForwardLifecycleTailSchema } from "./lifecycle-tail.js";
import { registerReviewApplicabilitySchemas } from "./applicability.js";
import { registerForwardReceiptLedgerSchema } from "./forward-receipt-ledger-schema.js";
import { registerSeverityGatingSchemas } from "./severity-gating.js";
import { registerReviewReentrySchema } from "./review-reentry-schema.js";

/** Compose every currently implemented review schema into a fresh kernel registry. */
export function registerReviewDomainSchemas(registry: KernelRegistry): KernelRegistry {
  registerChangeFactSchemas(registry);
  registerReviewApplicabilitySchemas(registry);
  registerReviewGateV2Schemas(registry);
  registerFindingRecordSchemas(registry);
  registerFixAuthorizationSchemas(registry);
  registerDispositionRecordSchemas(registry);
  registerSeverityGatingSchemas(registry);
  registerReviewResponseSchemas(registry);
  registerReviewOperationStateSchemas(registry);
  registerReviewReentrySchema(registry);
  registerForwardReceiptLedgerSchema(registry);
  registerForwardLifecycleTailSchema(registry);
  registerReviewPrimitiveSchemas(registry);
  registerReviewAssuranceSchemas(registry);
  registerReviewRoutingSchemas(registry);
  registerProjectRoutingPromotionSchema(registry);
  registerIndependentAnalysisSchema(registry);
  registerIndependentAnalysisProjectionSchema(registry);
  return registry;
}
