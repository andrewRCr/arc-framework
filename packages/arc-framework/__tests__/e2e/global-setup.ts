/** Native E2E setup consumes controller evidence or prepares direct runtime artifacts. */
import { resolve } from "node:path";
import type { TestProject } from "vitest/node";
import { ensureHookManagerTools, type ToolExec } from "../helpers/hook-manager-tools.js";
import { ensureTestRuntime } from "../../src/lib/build-runtime-setup.js";
import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";

/**
 * Establish required CLI and metafile output before E2E workers execute. The in-repo store override is cleared first,
 * so no worker, nor any CLI one spawns, inherits it.
 * @param project - Native project and its inherited controller context
 * @param toolExec - Optional hook-tool process boundary for synthetic runtime fixtures
 * @returns Completion once runtime artifacts and native hook tools qualify
 */
export async function setup(project: TestProject, toolExec?: ToolExec): Promise<void> {
  Reflect.deleteProperty(process.env, IN_REPO_STORE_OVERRIDE);
  const packageRoot = resolve(import.meta.dirname, "../..");
  await ensureTestRuntime(packageRoot, project.getProvidedContext());
  project.provide("arcHookManagerTools", await ensureHookManagerTools(packageRoot, toolExec));
}
