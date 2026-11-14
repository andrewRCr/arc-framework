/** Selects and composes the operational store backend for a checkout from its caller's ports. */

import type { RefStorePorts, StorePorts } from "./ports.js";

/** Compose the ref backend's ports from an operational store caller's ports.
 * @param ports - The caller's ports. Its Git executors pass the Git floor gate. Its file access, clock, and identity
 *   carry over. Its remote and locks have no place: the ref backend takes its remotes from their designation and
 *   serializes its writes through its own ref lock.
 * @returns Ref ports bound to the caller's checkout, reading its backing pointer only at a destination decision.
 */
export async function composeRefStorePorts(ports: StorePorts): Promise<RefStorePorts> {
  const [{ createDefaultRefStorePorts, createRefLockFactory }, { readBackingRepository }] = await Promise.all([
    import("./default-ports.js"), import("../config/status-reader.js")]);
  const { checkoutRoot } = ports;
  const base = createDefaultRefStorePorts({ checkoutRoot, exec: ports.exec, execInput: ports.execInput,
    backingRepository: () => readBackingRepository(checkoutRoot) });
  const fs: RefStorePorts["fs"] = { ...base.fs, ...ports.fs };
  return { ...base, fs, clock: ports.clock, identity: ports.identity, lock: createRefLockFactory({ checkoutRoot, fs }) };
}
