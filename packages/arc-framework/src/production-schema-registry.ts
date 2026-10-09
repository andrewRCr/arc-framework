/** Production schema-registry composition shared by public emitters and contract verification. */

import { registerDeliveryAuthoringSchemas } from "./lib/delivery/design-inventory.js";
import { registerDeliveryDomainSchemas } from "./lib/delivery/schema.js";
import { createKernelRegistry, type KernelRegistry } from "./lib/kernel/index.js";
import { registerDecomposeSchemas } from "./lib/work-unit/decompose-v3-schema.js";
import { registerSchemaCommandSchemas } from "./lib/schema-command/envelope.js";
import { registerSessionEnvelopeSchemas } from "./lib/session-envelope/registry.js";
import { registerReviewDomainSchemas } from "./scripts/review-gate/core/register-review-schemas.js";

/**
 * Compose every schema family served by the production CLI.
 *
 * @returns A fresh registry containing the complete production schema surface.
 */
export function createProductionSchemaRegistry(): KernelRegistry {
  return registerSchemaCommandSchemas(registerDecomposeSchemas(registerSessionEnvelopeSchemas(registerDeliveryAuthoringSchemas(
    registerDeliveryDomainSchemas(registerReviewDomainSchemas(createKernelRegistry())),
  ))));
}
