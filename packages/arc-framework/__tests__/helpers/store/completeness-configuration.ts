/** Inject completed native configuration damage until the caller explicitly repairs it. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RefStorePorts } from "../../../src/lib/store/ports.js";
import { makeGitProcessError } from "../git-exec-fake.js";

export type Fault = "native" | "canceled" | "signaled" | "untyped";

/** Observe real lookup failure and optionally retain physical damage through public cleanup. */
export function completenessFault(ports: RefStorePorts, refspec: string, kind: Fault = "native", persistent = false) {
  const originalExec = ports.exec;
  let fetched = false, injected = false, failure: unknown, restored = false;
  let repair: (() => Promise<void>) | undefined;
  const faulty: RefStorePorts = { ...ports, exec: async (command, args, options) => {
    if (fetched && !injected && args.includes("config") && args.includes("--null")
      && args.includes("--list") && !args.includes("--includes")) {
      injected = true;
      if (kind !== "native") {
        failure = kind === "untyped" ? new TypeError("Completeness configuration failed")
          : makeGitProcessError({ command, args, ...kind === "canceled" ? { isCanceled: true as const }
            : { exitCode: 128, signal: "SIGTERM" } });
        throw failure;
      }
      const directory = args.find(arg => arg.startsWith("--git-dir="))?.slice("--git-dir=".length)
        ?? join(ports.checkoutRoot, ".git");
      const path = join(directory, "config"), original = await readFile(path);
      await writeFile(path, Buffer.concat([original, Buffer.from("\n[unclosed\n")]));
      repair = async () => { await writeFile(path, original); restored = (await readFile(path)).equals(original); };
      try { return await originalExec(command, args, options); }
      catch (error) { failure = error; throw error; }
      finally { if (!persistent) await repair(); }
    }
    try { return await originalExec(command, args, options); }
    finally { if (args.includes("fetch") && options?.input?.includes(refspec)) fetched = true; }
  } };
  return { ports: faulty, repair: async () => repair?.(), evidence: () => ({ fetched, injected, failure, restored }) };
}

