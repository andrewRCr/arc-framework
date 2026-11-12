/** Observe an established adoption target before attachment or submission changes any state. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectionAdmission } from "../projection-admission.js";
import type { RecordReference } from "../identity.js";
import type { StoreRecord } from "../read.js";
import type { FileStat, RefusedMark } from "./index-schema.js";
import type { ProjectionSelectionContext } from "./selection-context.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import type { ObjectFormat } from "./blob-id.js";
import type { TakeInRead } from "./take-in-port.js";
import { gitBlobId } from "./blob-id.js";
import { parseStampedFile } from "./stamp.js";
import { readProjectionProtection } from "./protection.js";
import { readProjectionLinkBoundary, projectionLinkRemedy } from "./discovery-links.js";
import { markStoreRefusal } from "./refusal-mark.js";

/** Only read capabilities are required before the adopter chooses its effectful continuation. */
export type AdoptionObservationRoot = ProjectionSelectionContext & {
  readonly ports: Pick<ProjectionEnginePorts, "exec">;
  readonly context: ProjectionSelectionContext["context"] & { readonly format: ObjectFormat };
};

/** Existing records attach; new companions prepare an absent-record put; refusals preserve their remedy. */
export type ProjectionAdoptionVerdict =
  | { readonly kind: "existing"; readonly record: StoreRecord; readonly read: TakeInRead }
  | { readonly kind: "new"; readonly reference: RecordReference; readonly read: TakeInRead;
      readonly file: ProjectionAdmission["input"]["file"] }
  | { readonly kind: "refused"; readonly mark: RefusedMark; readonly stat: FileStat | null };

/** An accepted mint retains its initial authored input obligation until that file can be read. */
export function missingMintedMetadataMark(): RefusedMark {
  return { reason: "The stub was created, but its authored metadata file is missing.",
    remedy: { text: "Restore the authored metadata file, then retry adoption." } };
}

/** Apply protection, link, existence, and primary-creation rules in the adopter's ordinary order. */
export async function inspectProjectionAdoption(root: AdoptionObservationRoot, path: string,
  reference: RecordReference, stat: FileStat): Promise<ProjectionAdoptionVerdict> {
  const denied = await readProjectionProtection({ store: root.store, checkout: root.checkout,
    identity: root.identity, exec: root.ports.exec, verb: root.context.verb }, reference);
  if (denied !== null) return { kind: "refused", mark: denied, stat };
  const boundary = await readProjectionLinkBoundary(root.checkout, [path]);
  const linked = boundary(path);
  if (linked !== null) return { kind: "refused", stat: null, mark: { reason: "not-a-file", remedy: projectionLinkRemedy(linked) } };
  const bytes = await readFile(join(root.checkout, path));
  const read = { stat, blob: gitBlobId(bytes, root.context.format) };
  const existing = await root.store.read({ reference });
  if (existing.status === "ok") return { kind: "existing", record: existing.result, read };
  if (existing.refusal.code !== "not-found" || reference.kind === "cohort/document") {
    return { kind: "refused", stat, mark: markStoreRefusal(existing.refusal, root.context.verb) };
  }
  if (reference.kind === "work-item/meta") return { kind: "refused", stat, mark: {
    reason: "New work-unit metadata must be created through arc stub.",
    remedy: { text: "Create the stub in its backlog folder with arc stub, then retry adoption." },
  } };
  const text = bytes.toString("utf8"), markdown = path.endsWith(".md");
  return { kind: "new", reference, read, file: { content: markdown ? parseStampedFile(text).content : text.replaceAll("\r\n", "\n"),
    stamp: markdown ? parseStampedFile(text).stamp : null, mtimeNs: stat.mtimeNs.toString() } };
}
