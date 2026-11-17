/** Bind command entry and completion to projection write-back and stderr reporting. */
import type { ProjectionStubMintPort } from "./stub-mint-port.js";
import type { Command } from "commander";
import type { ProjectionCommandInput } from "./engine.js";
import { startProjection, endProjection } from "./engine.js";
import { createStore } from "../create.js";
import { createDefaultStorePorts } from "../default-store-ports.js";
import { resolveArcRoot } from "../../paths.js";
import { createProjectionReporter } from "./report.js";
import { bindSpawnMaterialization } from "./spawn-materialization.js";

/** Command bindings and output boundary, native when omitted. */
export interface ProjectionHookOptions {
  readonly input?: () => ProjectionCommandInput | Promise<ProjectionCommandInput>;
  readonly mint?: ProjectionStubMintPort;
  readonly writeError?: (text: string) => void;
}

/** Register after development guards and refresh hooks so completion settles before refresh. */
export function registerProjectionHooks(program: Command, options: ProjectionHookOptions = {}): void {
  let input: ProjectionCommandInput | undefined;
  let report: (() => void) | undefined;
  program.hook("preAction", async (_root, action) => {
    const bound = await (options.input ?? nativeProjectionInput)();
    const saving = action.parent === program && action.name() === "save";
    input = { ...bound, mint: bound.mint ?? options.mint, mode: saving ? "save" : "write-back", resolve: saving ? action.opts<{ resolve?: string }>().resolve : undefined,
      skipProjection: program.opts<{ skipProjection?: boolean }>().skipProjection === true };
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

function nativeProjectionInput(): ProjectionCommandInput {
  const cwd = process.cwd();
  const store = createStore(createDefaultStorePorts({ checkoutRoot: cwd }));
  if (!store.capabilities.stateOffBranch) return { store, checkout: cwd };
  const checkout = resolveArcRoot(cwd) ?? cwd;
  return { checkout, store: checkout === cwd ? store : createStore(createDefaultStorePorts({ checkoutRoot: checkout })) };
}
