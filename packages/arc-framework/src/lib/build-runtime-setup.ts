/** Qualified runtime handoff from an owning controller to native project setup. */
import { withBuildArtifactOwnership } from "./build-ownership.js";
import { ensureOwnedRuntimeArtifacts } from "./build-entry.js";
import { parseBuildEvidence, type BuildEvidence } from "./build-evidence.js";
import { readBuildQualification } from "./build-qualification.js";
import type { ProvidedContext } from "vitest";

/** Structured-clone-compatible context key shared by artifact-consuming projects. */
export const PREPARED_RUNTIME_BUILD_KEY = "arcRuntimeBuild";

declare module "vitest" {
  interface ProvidedContext {
    arcRuntimeBuild: BuildEvidence;
  }
}

/**
 * Validate a controller's exact generation against current inputs and required files.
 * @param packageRoot - Consuming checkout package
 * @param value - Untrusted provided or preparation result
 * @returns Matching current-format runtime/schema evidence
 */
export function validateRuntimeBuildEvidence(packageRoot: string, value: unknown): BuildEvidence {
  const supplied = parseBuildEvidence(value);
  if (supplied === null) throw new Error("Provided runtime/schema build evidence is malformed; nested repair is disabled.");
  const current = readBuildQualification(packageRoot, "runtimeMetafile");
  if (current.status !== "qualified") {
    throw new Error(`Provided runtime/schema output is unqualified: ${current.reason} `
      + "Run npm ci if installation needs repair, then npm run build:fast or download matching qualified artifacts.");
  }
  if (JSON.stringify(current.evidence) !== JSON.stringify(supplied)) {
    throw new Error("Provided runtime/schema evidence does not match the current qualified generation; nested repair is disabled.");
  }
  return current.evidence;
}

/**
 * Require the evidence key established by supported owning controllers.
 * @param packageRoot - Consuming checkout package
 * @param provided - Public controller/project context
 * @returns Validated provided generation, never a fallback build
 */
export function requirePreparedRuntimeBuild(packageRoot: string, provided: Partial<ProvidedContext>): BuildEvidence {
  if (!Object.hasOwn(provided, PREPARED_RUNTIME_BUILD_KEY)) {
    throw new Error("Supported test controller did not provide its prepared runtime/schema generation.");
  }
  return validateRuntimeBuildEvidence(packageRoot, provided[PREPARED_RUNTIME_BUILD_KEY]);
}

/**
 * Consume provided evidence or prepare a direct native setup's runtime generation.
 * @param packageRoot - Actual native setup package boundary
 * @param provided - Public project context; own-key presence selects the handoff
 * @returns Current qualified runtime/schema generation
 */
export async function ensureTestRuntime(packageRoot: string, provided: Partial<ProvidedContext>): Promise<BuildEvidence> {
  if (Object.hasOwn(provided, PREPARED_RUNTIME_BUILD_KEY)) return requirePreparedRuntimeBuild(packageRoot, provided);
  return await withBuildArtifactOwnership({ packageRoot, operation: "direct Vitest runtime preparation" },
    async (lease) => await ensureOwnedRuntimeArtifacts(lease));
}
