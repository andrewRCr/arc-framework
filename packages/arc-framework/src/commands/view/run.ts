/**
 * Read-once `arc view` orchestration.
 */

import type {
  RunViewOptions,
  ViewArtifactResolver,
  ViewOutput,
} from "./types.js";
import type { ResolvedViewRenderer, ViewRenderer } from "../../lib/view-renderer.js";

export interface ViewDependencies {
  resolveArtifact: ViewArtifactResolver;
  readFile: (path: string) => Promise<string>;
  resolveRenderer?: () => Promise<ResolvedViewRenderer>;
  renderWithPager?: (input: {
    renderer: ViewRenderer;
    content: string;
    displayPath: string;
  }) => Promise<void>;
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

  let content: string;
  try {
    content = await dependencies.readFile(artifact.path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      stdout: "",
      stderr: `Unable to read ${artifact.kind}: ${message}\n`,
      exitCode: 1,
    };
  }
  if (options.nonInteractive !== false) {
    return { stdout: content, stderr: "", exitCode: 0 };
  }

  try {
    if (dependencies.resolveRenderer === undefined || dependencies.renderWithPager === undefined) {
      throw new Error("TTY renderer dependencies are unavailable.");
    }
    const resolved = await dependencies.resolveRenderer();
    await dependencies.renderWithPager({
      renderer: resolved.renderer,
      content,
      displayPath: artifact.path,
    });
    return {
      stdout: "",
      stderr: resolved.warnings.map((warning) => `warning: ${warning}\n`).join(""),
      exitCode: 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      stdout: "",
      stderr: `Unable to render ${artifact.kind}: ${message}\n`,
      exitCode: 1,
    };
  }
}
