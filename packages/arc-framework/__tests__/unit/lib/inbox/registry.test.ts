/** Public command schemas are discoverable from the production composition. */
import { expect, it } from "vitest";
import { createProductionSchemaRegistry } from "../../../../src/production-schema-registry.js";
import { InboxResultSchema } from "../../../../src/lib/inbox/types.js";
import { RouteResultSchema } from "../../../../src/lib/inbox/route.js";
import { ErrandQueueResultSchema, ErrandQueueSetRequestSchema } from "../../../../src/lib/inbox/queue.js";

it("publishes the exact listing, routing, queue, and queue-request contracts", () => {
  const registry = createProductionSchemaRegistry();
  expect(registry.get("inbox-result")).toBe(InboxResultSchema);
  expect(registry.get("route-result")).toBe(RouteResultSchema);
  expect(registry.get("errand-queue-result")).toBe(ErrandQueueResultSchema);
  expect(registry.get("errand-queue-set-request")).toBe(ErrandQueueSetRequestSchema);
});
