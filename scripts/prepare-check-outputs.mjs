/** Establish repository-owned output roots before routed preparation freezes its generated inventory. */
import { mkdir } from "node:fs/promises";

await mkdir(new URL("../packages/arc-framework/.test-cost-runs/", import.meta.url), { recursive: true });
