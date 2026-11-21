/** The request an indexed file's send carries, shared by the persisting walk and the read-only check that predicts it. */
import type { RecordEntry } from "./index-schema.js";
import type { TakeInRequest, TakeInResolution } from "./take-in-port.js";

/** An unsent adoption sends its observed file as an adopting edit; any other entry sends against its recorded base. */
export function pendingFileRequest(checkout: string, path: string, entry: RecordEntry, resolution?: TakeInResolution): TakeInRequest {
  const adopting = entry.adoption?.kind === "write-back";
  const resumesHeldAdoption = entry.adoption?.kind === "read-back" && resolution?.kind === "hold";
  return { checkout, path, copy: null, entry: adopting || resumesHeldAdoption ? { ...entry, pending: false } : entry,
    base: path.endsWith(".md") ? { kind: "stamp", stamp: null } : { kind: "blob", blob: entry.base.blob },
    ...(resolution === undefined ? {} : { resolution }),
    ...(adopting ? { adopting: true as const, observedEdit: true } : {}) };
}
