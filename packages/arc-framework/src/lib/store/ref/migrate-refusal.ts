/** Typed operational migration stops preserve interruptions and restart records. */
import type { StoreCommandRefusal } from "../commands.js";

/** Carry a command refusal across copy, transport, and layout helpers without consuming faults. */
export class MigrationRefusal extends Error {
  constructor(readonly refusal: StoreCommandRefusal) { super(refusal.code === "store" ? refusal.refusal.condition : refusal.condition); }
}
