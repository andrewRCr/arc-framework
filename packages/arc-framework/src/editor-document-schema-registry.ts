/**
 * Schema registry for the editor documents provisioning writes into a checkout. It lives apart from the production
 * registry so that provisioning, which every `init` and checkout spawn runs, loads only the check-declaration schemas
 * rather than every schema family the CLI serves.
 */

import { registerCheckDeclarationSchemas } from "./lib/checks/declaration.js";
import { createKernelRegistry, type KernelRegistry } from "./lib/kernel/index.js";

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
