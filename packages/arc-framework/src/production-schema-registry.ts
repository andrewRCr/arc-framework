/** Production schema-registry composition shared by the build and fast verification. */

import { registerDeliveryAuthoringSchemas } from "./lib/delivery/design-inventory.js";
import { registerDeliveryDomainSchemas } from "./lib/delivery/schema.js";
import { createKernelRegistry, type KernelRegistry } from "./lib/kernel/index.js";
import { registerSessionEnvelopeSchemas } from "./lib/session-envelope/registry.js";
import { registerReviewDomainSchemas } from "./scripts/review-gate/core/register-review-schemas.js";

/**
 * Compose every schema family emitted by the production build.
 *
 * @returns A fresh registry containing the complete production schema surface.
 */
export function createProductionSchemaRegistry(): KernelRegistry {
  return registerSessionEnvelopeSchemas(registerDeliveryAuthoringSchemas(
    registerDeliveryDomainSchemas(registerReviewDomainSchemas(createKernelRegistry())),
  ));
}
