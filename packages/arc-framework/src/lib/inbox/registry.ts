/** Public schemas for listing, routing, and versioned queue requests. */
import type { KernelRegistry } from "../kernel/index.js";
import { InboxResultSchema } from "./types.js";
import { RouteResultSchema } from "./route.js";
import { ErrandQueueResultSchema, ErrandQueueSetRequestSchema } from "./queue.js";
/** Register the exact producer-owned result and request contracts.
 * @param registry - Caller-owned schema registry.
 * @returns Registry extended with the entry-routing command schemas.
 */
export function registerInboxSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(InboxResultSchema, { id: "inbox-result", version: 1, migrationPosture: "strict-current" });
  registry.register(RouteResultSchema, { id: "route-result", version: 1, migrationPosture: "strict-current" });
  registry.register(ErrandQueueResultSchema, { id: "errand-queue-result", version: 1, migrationPosture: "strict-current" });
  registry.register(ErrandQueueSetRequestSchema, { id: "errand-queue-set-request", version: 1, migrationPosture: "strict-current", authored: "request" });
  return registry;
}
