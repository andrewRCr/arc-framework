/** Typed operational migration stops preserve interruptions and restart records. */
import type { StoreCommandRefusal } from "../commands.js";

/** Carry a command refusal across copy, transport, and layout helpers without consuming faults. */
export class MigrationRefusal extends Error {
  constructor(readonly refusal: StoreCommandRefusal) { super(refusal.code === "store" ? refusal.refusal.condition : refusal.condition); }
}

/** Endpoint configuration failure retains acquisition evidence until the recorded transport can be repaired. */
export class MigrationTransportRefusal extends MigrationRefusal {}

/** A completed acquisition failure retains its gathering without changing its refusal classification. */
export class MigrationAcquisitionRefusal extends MigrationRefusal {}
