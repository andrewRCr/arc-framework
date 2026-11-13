/** Bind the importing checkout to the same tracked and personal source ports as the native import. */
import { createRefBackendContext, type RefBackendContext } from "../../lib/store/ref/context.js";
import { createDefaultStorePorts, createDefaultRefStorePorts } from "../../lib/store/default-ports.js";
import { createStore } from "../../lib/store/create.js";
import { readBackingRepository, readConfigSettings } from "../../lib/config/status-reader.js";

/** A native import context whose pre-import source is always bound. */
export type WindowImportContext = RefBackendContext & { importSource: NonNullable<RefBackendContext["importSource"]> };

/** Construct the native read basis without invoking migration or any state writer. */
export async function createWindowImportContext(repo: string): Promise<WindowImportContext> {
  const ports = createDefaultRefStorePorts({ checkoutRoot: repo, backingRepository: () => readBackingRepository(repo) });
  const sourcePorts = { ...createDefaultStorePorts({ checkoutRoot: repo, exec: ports.exec, execInput: ports.execInput }), ...ports };
  const baseBranch = (await readConfigSettings(repo)).settings["branch.base"];
  const importSource = { store: createStore(sourcePorts), ports: sourcePorts, baseBranch };
  return { ...createRefBackendContext({ ...ports, importSource }), importSource };
}
