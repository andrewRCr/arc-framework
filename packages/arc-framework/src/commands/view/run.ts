/**
 * Read-once `arc view` orchestration.
 */

import type {
  RunViewOptions,
  ViewArtifactResolver,
  ViewOutput,
} from "./types.js";

export interface ViewDependencies {
  resolveArtifact: ViewArtifactResolver;
  readFile: (path: string) => Promise<string>;
}

/** Resolve one semantic kind and emit its plain, read-only representation. */
export async function runView(
  options: RunViewOptions,
  dependencies: ViewDependencies,
): Promise<ViewOutput> {
  const kind = options.kind ?? "tasks";
  const artifact = await dependencies.resolveArtifact({
    cwd: options.cwd,
    kind,
    project: options.project,
    identity: options.identity,
  });

  if (artifact.status === "error") {
    return { stdout: "", stderr: `${artifact.message}\n`, exitCode: 1 };
  }
  if (artifact.status === "absent") {
    return {
      stdout: `${artifact.kind} is not present.\n`,
      stderr: "",
      exitCode: 0,
    };
  }

  try {
    return {
      stdout: await dependencies.readFile(artifact.path),
      stderr: "",
      exitCode: 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      stdout: "",
      stderr: `Unable to read ${artifact.kind}: ${message}\n`,
      exitCode: 1,
    };
  }
}
