/** Production schema-registry composition shared by public emitters and contract verification. */

import { registerInboxSchemas } from "./lib/inbox/registry.js";
import { registerCheckDeclarationSchemas } from "./lib/checks/declaration.js";
import { registerDeliveryAuthoringSchemas } from "./lib/delivery/design-inventory.js";
import { registerDeliveryDomainSchemas } from "./lib/delivery/schema.js";
import { createKernelRegistry, type KernelRegistry } from "./lib/kernel/index.js";
import { registerCutMapSchemas } from "./lib/decompose/cut-map-schema.js";
import { registerDecomposeSchemas } from "./lib/work-unit/decompose-v3-schema.js";
import { registerSchemaCommandSchemas } from "./lib/schema-command/envelope.js";
import { registerSessionEnvelopeSchemas } from "./lib/session-envelope/registry.js";
import { registerReviewDomainSchemas } from "./scripts/review-gate/core/register-review-schemas.js";
import { registerHandoffWriteSchemas } from "./lib/handoff/write-schema.js";

/**
 * Compose every schema family served by the production CLI.
 *
 * @returns A fresh registry containing the complete production schema surface.
 */
export function createProductionSchemaRegistry(): KernelRegistry {
  const registry = registerCheckDeclarationSchemas(registerSchemaCommandSchemas(registerCutMapSchemas(registerDecomposeSchemas(registerSessionEnvelopeSchemas(registerDeliveryAuthoringSchemas(
    registerDeliveryDomainSchemas(registerReviewDomainSchemas(createKernelRegistry())),
  ))))));
  return registerInboxSchemas(registerHandoffWriteSchemas(registry));
}

/**
 * Compose only the schema families that publish checkout editor documents.
 *
 * Provisioning projects this registry rather than the complete surface, since projection cost grows with every
 * registered root while the documents it writes do not.
 *
 * @returns A fresh registry whose editor documents match the complete production surface's.
 */
export function createEditorDocumentSchemaRegistry(): KernelRegistry {
  return registerCheckDeclarationSchemas(createKernelRegistry());
}
