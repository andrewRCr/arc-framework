/** One connection point for the projection's editable Markdown selection. */
import { execa } from "execa";
import { z } from "zod";
import { isManagedPath } from "../kernel/index.js";
import { environmentForGitCwd } from "../git/process-executor.js";
import { createStore } from "../store/create.js";
import { createDefaultStorePorts } from "../store/default-store-ports.js";
import { projectionProcessState } from "../store/projection/process-state.js";
import { projectionSelectionResult } from "../store/projection/selection.js";
import { projectionStartRefusal, type ProjectionStartRefusal } from "../store/projection/start-refusal.js";
import type { Store } from "../store/contract.js";
import type { CheckRequest } from "./request.js";
import type { PathListSelection } from "./path-list.js";

/** Lazy capability composition and the literal subprocess boundary used outside commands. */
export interface ProjectedSelectionIO {
  readonly createStore: (root: string) => Pick<Store, "capabilities">;
  readonly run: (command: string, args: readonly string[], root: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

const SelectionPathsSchema = z.strictObject({ paths: z.array(z.string().refine(isManagedPath)) });
const SelectionRefusalSchema = z.object({ status: z.literal("refused"), refusal: z.object({
  code: z.string().min(1), condition: z.string().min(1), remedy: z.object({ text: z.string().min(1) }),
}) });

/** The projected Markdown files this checkout may edit, or the part changed since its last save. */
export async function readProjectedSelection(root: string, options: { changed: boolean },
  io: Partial<ProjectedSelectionIO> = {}): Promise<PathListSelection> {
  try {
    const state = projectionProcessState(), command = state.command;
    if (command?.checkout === root) {
      const refusal = projectionStartRefusal("arc selection", root);
      if (refusal !== null) return unavailableRefusal(refusal);
      const result = await projectionSelectionResult(command.store, root, options);
      return result.status === "ok" ? { status: "ok", paths: result.result.paths } : unavailableRefusal(result.refusal);
    }
    const store = (io.createStore ?? composeStore)(root);
    if (!store.capabilities.stateOffBranch) return { status: "ok", paths: [] };
    return decodeSelection(await (io.run ?? runSelection)("npx", ["arc", "selection", "--json", ...(options.changed ? ["--changed"] : [])], root));
  } catch (error) {
    return { status: "unavailable", reason: String(error) };
  }
}

function composeStore(root: string): Pick<Store, "capabilities"> {
  return createStore(createDefaultStorePorts({ checkoutRoot: root }));
}

async function runSelection(command: string, args: readonly string[], root: string) {
  const result = await execa(command, args, { cwd: root, env: environmentForGitCwd(root), extendEnv: false, reject: false, stdin: "ignore" });
  return { exitCode: result.exitCode ?? 1, stdout: result.stdout, stderr: result.stderr };
}

function unavailableRefusal(refusal: Pick<ProjectionStartRefusal, "condition" | "remedy"> & { readonly code: string }): PathListSelection {
  return { status: "unavailable", reason: `${refusal.code}: ${refusal.condition}\n${refusal.remedy.text}` };
}

function decodeSelection(result: Awaited<ReturnType<ProjectedSelectionIO["run"]>>): PathListSelection {
  let output: unknown;
  try { output = JSON.parse(result.stdout); } catch { /* Preserve process diagnostics before reporting malformed output. */ }
  const refusal = SelectionRefusalSchema.safeParse(output);
  if (refusal.success) return unavailableRefusal(refusal.data.refusal);
  if (result.exitCode !== 0) return { status: "unavailable", reason: result.stderr.trim() || result.stdout.trim()
    || `arc selection: exited ${result.exitCode}; repair the command failure, then retry.` };
  const selected = SelectionPathsSchema.safeParse(output);
  return selected.success ? { status: "ok", paths: selected.data.paths }
    : { status: "unavailable", reason: "arc selection returned an invalid JSON path list; repair its output, then retry." };
}

/** Selection acquisition shared by check execution and Markdown tooling. */
export type ProjectedSelectionReader = typeof readProjectedSelection;

/** Acquire one request-wide scope, retaining provider refusals and thrown read failures. */
export async function requestProjectedSelection(reader: ProjectedSelectionReader, root: string,
  request: CheckRequest): Promise<PathListSelection> {
  const scope = request.scope;
  const changed = request.form.kind !== "run" || (scope !== undefined && scope.kind !== "all" && scope.kind !== "paths");
  try {
    return await reader(root, { changed });
  } catch (error) {
    return { status: "unavailable", reason: String(error) };
  }
}
