/** Public ref-store construction whose ports refuse any pre-admission I/O. */
import { createRefStore } from "../../../src/lib/store/create.js";
import type { RefStorePorts } from "../../../src/lib/store/ports.js";
import { KIND_REGISTRY } from "../../../src/lib/store/registry.js";

export function createPreflightRefStore(registry: NonNullable<RefStorePorts["registry"]> = KIND_REGISTRY) {
  const unexpected = async (): Promise<never> => { throw new Error("Admission consulted an I/O port"); };
  const ports: RefStorePorts = {
    exec: unexpected, execInput: unexpected, rawExec: unexpected,
    fs: { readFile: unexpected, readdir: unexpected, lstat: unexpected, mkdir: unexpected,
      writeFile: unexpected, exclusiveCreate: unexpected, unlink: unexpected },
    checkoutRoot: "/no-repository", identity: unexpected, actor: unexpected, lock: unexpected,
    clock: () => { throw new Error("Admission consulted the clock"); },
    sleep: { wait: unexpected, bound: unexpected }, random: () => { throw new Error("Admission drew randomness"); }, registry,
  };
  return createRefStore(ports);
}
