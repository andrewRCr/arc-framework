/** Store reads used to choose and render a projection, independent of its writable destination. */
import type { Store } from "../contract.js";

/** Both a writable store and a read-only store satisfy this source without an adapter. */
export type ProjectionSource = Pick<Store, "read" | "list" | "version" | "changes">;
