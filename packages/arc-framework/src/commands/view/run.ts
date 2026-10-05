/**
 * Artifact destination orchestration for `arc view`.
 */

import { resolve as resolvePath } from "node:path";

import type {
  RunViewOptions,
  ViewArtifactResolver,
  ViewArtifactResult,
  ViewOutput,
} from "../../lib/view/types.js";
import { prepareViewDocument, type ViewDocumentAnchor } from "../../lib/view/format.js";
import { isSlugSafe } from "../../lib/kernel/index.js";
import type { ResolvedViewRenderer, ViewRenderer } from "../../lib/view-renderer.js";
import type { ResolvedViewClock } from "../../lib/view/clock.js";

export interface ViewDependencies {
  resolveArtifact: ViewArtifactResolver;
  readFile: (path: string) => Promise<string>;
  launchEditor?: (path: string) => Promise<void>;
  resolveRenderer?: () => Promise<ResolvedViewRenderer>;
  renderWithPager?: (input: {
    renderer: ViewRenderer;
    content: string;
    displayPath: string;
    anchor?: ViewDocumentAnchor;
  }) => Promise<void>;
  now?: () => Date;
  clock?: ResolvedViewClock;
}

/** Resolve one semantic artifact and route it to the requested destination. */
export async function runView(
  options: RunViewOptions,
  dependencies: ViewDependencies,
): Promise<ViewOutput> {
  const kind = options.current === true && options.kind === undefined ? "tasks" : options.kind;
  const rejection = rejectInvalidOptions(options, kind);
  if (rejection !== null) return rejection;
  const artifact = await dependencies.resolveArtifact({
    cwd: options.cwd,
    ...(kind === undefined ? {} : { kind }),
    project: options.project,
    identity: options.identity,
    ...(options.forSlug === undefined ? {} : { forSlug: options.forSlug }),
  });

  if (artifact.status === "error") {
    return { stdout: "", stderr: `${artifact.message}\n`, exitCode: 1 };
  }
  if (options.current === true && artifact.kind !== "tasks") {
    return {
      stdout: "",
      stderr: "--current is only valid with the tasks kind.\n",
      exitCode: 1,
    };
  }
  if (options.editor === true) return openArtifactInEditor(artifact, options, dependencies);
  if (options.path === true) {
    // A path consumer such as `$(arc view <kind> --path)` must never receive the absence message as a path.
    return artifact.status === "absent"
      ? { stdout: "", stderr: `${artifact.kind} is not present.\n`, exitCode: 1 }
      : { stdout: `${resolvePath(options.cwd, artifact.path)}\n`, stderr: "", exitCode: 0 };
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
  const prepared = prepareViewDocument({
    kind: artifact.kind,
    workUnit: artifact.workUnit,
    content,
    current: options.current === true,
    now: dependencies.now?.() ?? new Date(),
    clock: dependencies.clock?.clock ?? "24h",
    warnings: dependencies.clock?.warnings ?? [],
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
    await dependencies.renderWithPager({
      renderer: resolved.renderer,
      content: prepared.content,
      displayPath: artifact.path,
      ...(prepared.anchor === undefined ? {} : { anchor: prepared.anchor }),
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

async function openArtifactInEditor(
  artifact: Exclude<ViewArtifactResult, { status: "error" }>,
  options: RunViewOptions,
  dependencies: ViewDependencies,
): Promise<ViewOutput> {
  if (artifact.status === "absent") {
    return { stdout: "", stderr: `${artifact.kind} is not present.\n`, exitCode: 1 };
  }
  try {
    if (dependencies.launchEditor === undefined) throw new Error("Editor launcher is unavailable");
    await dependencies.launchEditor(resolvePath(options.cwd, artifact.path));
    return { stdout: "", stderr: "", exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const remedy = message.includes("ARC_EDITOR") ? "" : ". Set ARC_EDITOR to a working editor command.";
    return { stdout: "", stderr: `Unable to open ${artifact.kind} in editor: ${message}${remedy}\n`, exitCode: 1 };
  }
}

/** Refuse option combinations that are invalid before any artifact is resolved. */
function rejectInvalidOptions(options: RunViewOptions, kind: string | undefined): ViewOutput | null {
  if (options.editor === true) {
    if (options.path === true || options.current === true) {
      const conflict = options.path === true ? "--path" : "--current";
      return { stdout: "", stderr: `--editor cannot be combined with ${conflict}.\n`, exitCode: 1 };
    }
    if (options.editorAllowed !== true) {
      return { stdout: "", stderr: "--editor requires an interactive terminal and allowed interaction.\n", exitCode: 1 };
    }
  }
  if (options.path === true && options.current === true) {
    return { stdout: "", stderr: "--path cannot be combined with --current.\n", exitCode: 1 };
  }
  if (options.forSlug !== undefined) {
    if (!isSlugSafe(options.forSlug)) {
      return {
        stdout: "",
        stderr: `Invalid work-unit slug "${options.forSlug}".\n`,
        exitCode: 1,
      };
    }
    if (kind === "working-memory" || kind === "inbox") {
      return {
        stdout: "",
        stderr: `--for is not valid with the identity-global ${kind} kind.\n`,
        exitCode: 1,
      };
    }
  }
  return null;
}

function formatWarnings(warnings: readonly string[]): string {
  return warnings.map((warning) => `warning: ${warning}\n`).join("");
}
