/** Read-only acquisition operations shared by preparation and atomic kind admission. */
import type { Store } from "../store/contract.js";

/** All acquisition authority, without a writable store or a live state-version read. */
export type DecomposeReadStore = Pick<Store, "read" | "list" | "lookup" | "history">;
