/**
 * Read-once `arc view` orchestration.
 */

import type {
  RunViewOptions,
  ViewArtifactResolver,
  ViewOutput,
} from "./types.js";
import { prepareViewDocument, type ViewDocumentAnchor } from "./format.js";
import type { ResolvedViewRenderer, ViewRenderer } from "../../lib/view-renderer.js";

export interface ViewDependencies {
  resolveArtifact: ViewArtifactResolver;
  readFile: (path: string) => Promise<string>;
  resolveRenderer?: () => Promise<ResolvedViewRenderer>;
  renderWithPager?: (input: {
    renderer: ViewRenderer;
    content: string;
    displayPath: string;
    anchor?: ViewDocumentAnchor;
  }) => Promise<void>;
  now?: () => Date;
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
  if (options.current === true && artifact.kind !== "tasks") {
    return {
      stdout: "",
      stderr: "--current is only valid with the tasks kind.\n",
      exitCode: 1,
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
  const prepared = prepareViewDocument({
    kind: artifact.kind,
    workUnit: artifact.workUnit,
    content,
    current: options.current === true,
    now: dependencies.now?.() ?? new Date(),
  });
  if (options.nonInteractive !== false || prepared.bypassPager) {
    return {
      stdout: prepared.content,
      stderr: formatWarnings(prepared.warnings),
      exitCode: 0,
    };
  }

  try {
    if (dependencies.resolveRenderer === undefined || dependencies.renderWithPager === undefined) {
      throw new Error("TTY renderer dependencies are unavailable.");
    }
    const resolved = await dependencies.resolveRenderer();
    const warnings = [...prepared.warnings, ...resolved.warnings];
    if (resolved.renderer === "glow" && prepared.anchor !== undefined) {
      warnings.push("glow does not preserve source lines; opened without a current-task anchor.");
    }
    await dependencies.renderWithPager({
      renderer: resolved.renderer,
      content: prepared.content,
      displayPath: artifact.path,
      ...(resolved.renderer !== "glow" && prepared.anchor !== undefined
        ? { anchor: prepared.anchor }
        : {}),
    });
    return {
      stdout: "",
      stderr: formatWarnings(warnings),
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

function formatWarnings(warnings: readonly string[]): string {
  return warnings.map((warning) => `warning: ${warning}\n`).join("");
}
