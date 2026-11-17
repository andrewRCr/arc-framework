/** Preserve actual send and installation outcomes separately from durable pending marks. */
import type { TakeInResult } from "./take-in-port.js";

/** What the file walk actually sent and installed during this pass. */
export interface ProjectionFileWriteObservation {
  readonly path: string;
  readonly result: TakeInResult;
  readonly installation: "attempted" | "not-authorized";
  readonly rebuilt?: boolean;
}
