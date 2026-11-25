/** Bind command entry and completion to projection write-back and stderr reporting. */
import type { ProjectionStubMintPort } from "./stub-mint-port.js";
import type { Command } from "commander";
import { isAbsolute, relative, sep } from "node:path";
import type { ProjectionCommandInput } from "./engine.js";
import { startProjection, endProjection } from "./engine.js";
import { createStore } from "../create.js";
import { createDefaultStorePorts } from "../default-store-ports.js";
import { StoreRefusalError } from "../refusal-error.js";
import { findTrackedStateRefusal, type TrackedStateRefusal } from "../selection.js";
import { resolveArcRoot } from "../../paths.js";
import type { GitExec } from "../../git/exec.js";
import { isGitProcessError } from "../../git/process-error.js";
import { canonicalCheckout } from "./checkout-identity.js";
import { createProjectionReporter } from "./report.js";
import { bindSpawnMaterialization } from "./spawn-materialization.js";

/** A command's store and checkout as the root hook binds them, with the tracked-state predicate over its `HEAD`. */
export interface ProjectionHookInput extends ProjectionCommandInput {
  /** The tracked-state refusal for the checkout's `HEAD`, or null where it tracks no ARC state; absent reads as null. */
  readonly findTrackedState?: () => Promise<TrackedStateRefusal | null>;
}

/** Command bindings and output boundary, native when omitted. */
export interface ProjectionHookOptions {
  readonly input?: () => ProjectionHookInput | Promise<ProjectionHookInput>;
  readonly mint?: ProjectionStubMintPort;
  readonly writeError?: (text: string) => void;
}

/** The `arc check` subcommands Git hooks run. */
const GIT_HOOK_CHECKS: ReadonlySet<string> = new Set(["pre-commit", "commit-msg", "pre-push"]);

/** Register after development guards and refresh hooks so completion settles before refresh. */
export function registerProjectionHooks(program: Command, options: ProjectionHookOptions = {}): void {
  let input: ProjectionCommandInput | undefined;
  let report: (() => void) | undefined;
  program.hook("preAction", async (_root, action) => {
    const { findTrackedState, ...bound } = await (options.input ?? nativeProjectionInput)();
    // Evaluated before the start, which takes the projection lock and reads the store.
    const trackedState = bound.store.capabilities.stateOffBranch ? await findTrackedState?.() ?? null : null;
    if (trackedState !== null && !runsFromGitHook(program, action)) throw new StoreRefusalError(trackedState, true);
    const saving = action.parent === program && action.name() === "save";
    input = { ...bound, mint: bound.mint ?? options.mint, mode: saving ? "save" : "write-back", resolve: saving ? action.opts<{ resolve?: string }>().resolve : undefined,
      skipProjection: program.opts<{ skipProjection?: boolean }>().skipProjection === true,
      ...(trackedState === null ? {} : { trackedState }) };
    await startProjection(input);
    bindSpawnMaterialization(input);
    report = createProjectionReporter(input.store, options.writeError);
    report();
  });
  program.hook("postAction", async () => {
    if (input === undefined) return;
    await endProjection(input);
    report?.();
  });
}

/** Whether a Git hook runs the command: one of `arc check`'s hook subcommands, or a hidden `hook-*` command. Over a
 * `HEAD` that tracks ARC state these run with the projection off, so the remedy's commit, merge, and push pass their
 * hooks. */
function runsFromGitHook(program: Command, action: Command): boolean {
  if (action.parent === program) return action.name().startsWith("hook-");
  return action.parent?.parent === program && action.parent.name() === "check" && GIT_HOOK_CHECKS.has(action.name());
}

async function nativeProjectionInput(): Promise<ProjectionHookInput> {
  const cwd = process.cwd();
  const ports = createDefaultStorePorts({ checkoutRoot: cwd });
  const store = createStore(ports);
  if (!store.capabilities.stateOffBranch) return { store, checkout: cwd };
  const arcRoot = resolveArcRoot(cwd);
  const installed = arcRoot !== null && (arcRoot === cwd || await insideWorktree(ports.exec, arcRoot));
  const checkout = installed ? arcRoot : cwd;
  const boundPorts = checkout === cwd ? ports : createDefaultStorePorts({ checkoutRoot: checkout });
  return { checkout, store: checkout === cwd ? store : createStore(boundPorts), unprojected: !installed,
    findTrackedState: () => findTrackedStateRefusal(boundPorts.exec) };
}

/** An enclosing ARC installation belongs to this command only if it lies within the caller's worktree. */
async function insideWorktree(exec: GitExec, arcRoot: string): Promise<boolean> {
  let toplevel: string;
  try {
    toplevel = (await exec("git", ["rev-parse", "--show-toplevel"],
      { diagnosticLocale: "stable", preserveOutput: true })).stdout.replace(/\r?\n$/u, "");
  } catch (error) {
    // Keep the installed-but-not-a-repository path, where the engine reports its missing Git directory.
    if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 128
      && /not a git repository/iu.test(error.stderr)) return true;
    throw error;
  }
  const fromTop = relative(await canonicalCheckout(toplevel), await canonicalCheckout(arcRoot));
  return fromTop !== ".." && !fromTop.startsWith(`..${sep}`) && !isAbsolute(fromTop);
}
