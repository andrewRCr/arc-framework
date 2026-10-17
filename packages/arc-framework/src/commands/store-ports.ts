/** Bind explicit store commands to the invoking checkout's tracked backing pointer. */

import { readBackingRepository } from "../lib/config/status-reader.js";
import { createDefaultRefStorePorts } from "../lib/store/default-ports.js";
import type { RefStorePorts } from "../lib/store/ports.js";

/** Keep configuration reads outside storage and lazy until a destination decision requests one. */
export function createStoreCommandPorts(checkoutRoot: string): RefStorePorts {
  return createDefaultRefStorePorts({ checkoutRoot, backingRepository: () => readBackingRepository(checkoutRoot) });
}
