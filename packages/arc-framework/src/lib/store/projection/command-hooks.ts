/** Bind command entry and completion to projection write-back and stderr reporting. */
import type { Command } from "commander";
import type { ProjectionCommandInput } from "./engine.js";
import { startProjection, endProjection } from "./engine.js";
import { createStore } from "../create.js";
import { createDefaultStorePorts } from "../default-store-ports.js";
import { resolveArcRoot } from "../../paths.js";
import { createProjectionReporter } from "./report.js";

/** Command bindings and output boundary, native when omitted. */
export interface ProjectionHookOptions {
  readonly input?: () => ProjectionCommandInput | Promise<ProjectionCommandInput>;
  readonly writeError?: (text: string) => void;
}

/** Register after development guards and refresh hooks so completion settles before refresh. */
export function registerProjectionHooks(program: Command, options: ProjectionHookOptions = {}): void {
  let input: ProjectionCommandInput | undefined;
  let report: (() => void) | undefined;
  program.hook("preAction", async (_root, action) => {
    const bound = await (options.input ?? nativeProjectionInput)();
    input = { ...bound, mode: action.parent === program && action.name() === "save" ? "save" : "write-back" };
    await startProjection(input);
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
