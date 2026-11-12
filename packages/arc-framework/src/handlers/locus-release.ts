/** Mutation adapter for releasing a work unit's machine-local checkout claim. */
import type { Store } from "../lib/store/contract.js";
import type { GitExec } from "../lib/git/exec.js";
import type { ProjectionRemovalSlots } from "../lib/git/worktree-removal.js";
import { createStore, createDefaultStorePorts } from "../lib/store/index.js";
import { createGitExec } from "../lib/io-context.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { runDormantStoreCommand } from "../commands/store-command-support.js";
import { runLocusRelease } from "../lib/locus/release.js";
import { requireArcProjectRoot, resolveUserIdentity } from "./shared.js";
/** Explicit operational and projection bindings for the mutation boundary. */
export interface LocusReleaseHandlerContext {
  cwd?: string; store?: Store; exec?: GitExec; identity?: string;
  projectionRemovalSlots?: ProjectionRemovalSlots; chdir?: (path: string) => void;
}
/** Release the named holder or entering checkout through its bound lifecycle operations. */
export async function handleLocusRelease(slug: string | undefined, options: { json?: boolean },
  context: LocusReleaseHandlerContext = {}): Promise<void> {
  const cwd = context.cwd ?? requireArcProjectRoot();
  if (cwd === null) return;
  const executor = context.exec ?? createGitExec();
  const exec: GitExec = (command, args, input) => executor(command, args, { cwd, ...input });
  const store = context.store ?? createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec }));
  if (!store.capabilities.stateOffBranch) {
    const result = runDormantStoreCommand("locus release", store);
    process.exitCode = 1;
    if (options.json) process.stdout.write(`${JSON.stringify(result)}\n`);
    else process.stderr.write(`Error [unsupported]: ${result.refusal.condition} ${result.refusal.remedy.text}\n`);
    return;
  }
  const [{ settings }, identity] = await Promise.all([readConfigSettings(cwd), context.identity ?? resolveUserIdentity(exec)]);
  const result = await runLocusRelease({ cwd, exec, store, identity, baseBranch: settings["branch.base"],
    projectionRemovalSlots: context.projectionRemovalSlots, chdir: context.chdir }, slug);
  if (result.status === "refused") process.exitCode = 1;
  if (options.json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else if (result.status === "refused") process.stderr.write(`Error: ${result.reason}\n`);
  else process.stdout.write(`${result.spawned ? "Removed" : "Released"} checkout ${result.checkoutPath}.\n`);
}
