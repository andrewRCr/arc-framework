/** Native integration setup consumes controller evidence or prepares direct runtime artifacts. */
import { resolve } from "node:path";
import type { TestProject } from "vitest/node";
import { ensureTestRuntime } from "../../src/lib/build-runtime-setup.js";
import { prepareIntegrationRunRoot } from "../helpers/integration-temp-root.js";
import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";

/**
 * Establish required CLI and metafile output before integration workers execute, then create the run's own temp
 * directory when the config gave workers one. The in-repo store override is cleared first, so no worker, nor any
 * process one spawns, inherits it.
 * @param project - Native project and its inherited controller context
 * @returns A teardown removing the run's temp directory, or nothing when workers use the OS temp root
 */
export async function setup(project: TestProject): Promise<(() => void) | undefined> {
  Reflect.deleteProperty(process.env, IN_REPO_STORE_OVERRIDE);
  await ensureTestRuntime(resolve(import.meta.dirname, "../.."), project.getProvidedContext());
  // A project with no `env` resolves it as undefined, not empty, whatever its declared type says.
  const runRoot = (project.config.env as Partial<NodeJS.ProcessEnv> | undefined)?.TMPDIR;
  return runRoot === undefined ? undefined : prepareIntegrationRunRoot(runRoot);
}
