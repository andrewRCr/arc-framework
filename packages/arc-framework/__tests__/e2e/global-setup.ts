/** Native E2E setup consumes controller evidence or prepares direct runtime artifacts. */
import { resolve } from "node:path";
import type { TestProject } from "vitest/node";
import { ensureTestRuntime } from "../../src/lib/build-runtime-setup.js";

/**
 * Establish required runtime/schema output before E2E workers execute.
 * @param project - Native project and its inherited controller context
 * @returns Completion once the supplied or directly prepared generation qualifies
 */
export async function setup(project: TestProject): Promise<void> {
  await ensureTestRuntime(resolve(import.meta.dirname, "../.."), project.getProvidedContext());
}
