/** Read an archive opening's path, ownership, and adoption evidence without changing content or admitting a record. */
import { join } from "node:path";
import type { ProjectionIndex, RefusedMark, FileStat } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import { readProjectionLinkBoundary, projectionLinkRemedy } from "./discovery-links.js";
import { isExcludedProjectionPath } from "./discovery-exclusions.js";
import { gateRead } from "./read-gate.js";
import { readProjectionProtection } from "./protection.js";
import { resolveProjectionAdoptionIntent } from "./adoption-intent.js";
import { inspectProjectionAdoption } from "./adoption-verdict.js";
import { evidenceHeldProjectionMark, isEvidenceHeldEntry, withheldProjectionMark } from "./materialization-file.js";

/** The entry an opening may mark, or the same repair evidence its owner reports. */
export type ProjectionEditInspection = { readonly kind: "ready"; readonly entry: ProjectionIndex["entries"][string] }
  | { readonly kind: "refused"; readonly mark: RefusedMark };

/** Compose the existing path, protection, and adoption readers, stopping before store admission. */
export async function inspectProjectionEditPath(root: ProjectionRootState, index: ProjectionIndex, path: string): Promise<ProjectionEditInspection> {
  const entry = index.entries[path];
  if (entry?.withheld) return refuse(isEvidenceHeldEntry(entry) ? evidenceHeldProjectionMark() : entry.refused ?? withheldProjectionMark());
  const gate = await readEditFile(root, path, entry?.kind === "record");
  if (gate.kind === "refused") return gate;
  if (entry?.kind === "record") {
    const denied = await readProjectionProtection({ store: root.store, checkout: root.checkout, identity: root.identity,
      exec: root.ports.exec, verb: root.context.verb }, entry.reference);
    if (denied !== null) return refuse(denied);
  }
  if (!path.startsWith(".arc/completed/")) return refuse({ reason: `${path} is outside this checkout's completed archive.`,
    remedy: { text: "Edit an in-flight file in place; arc edit opens only files under .arc/completed/." } });
  if (!root.writable(path)) return refuse({ reason: `The projection ignore guard does not permit changing ${path}.`,
    remedy: { text: "Repair the reported projection ignore rules and retry arc edit." } });
  if (entry?.kind === "record") return { kind: "ready", entry };
  const target = await resolveProjectionAdoptionIntent(root, index, path);
  if (target.kind === "refused") return refuse(target.mark);
  if (target.kind !== "reference") return refuse({ reason: `${path} has no established archive owner.`,
    remedy: { text: "Place the file in its existing archived work unit or Errand's folder, then retry arc edit." } });
  const verdict = await inspectProjectionAdoption(root, path, target.reference, gate.stat);
  if (verdict.kind === "refused") return refuse(verdict.mark);
  return { kind: "ready", entry: { ...entry, kind: "ownerless", stat: gate.stat, opened: true } };
}

function refuse(mark: RefusedMark): Extract<ProjectionEditInspection, { kind: "refused" }> { return { kind: "refused", mark }; }

async function readEditFile(root: ProjectionRootState, path: string, stored: boolean):
Promise<{ kind: "read"; stat: FileStat } | Extract<ProjectionEditInspection, { kind: "refused" }>> {
  if (isExcludedProjectionPath(path)) return refuse({
    reason: `${path} is an editor or system side file, not an adoptable projected file.`,
    remedy: { text: "Keep side files outside projected roots, or remove the side file and open the intended document." },
  });
  const linked = (await readProjectionLinkBoundary(root.checkout, [path]))(path);
  if (linked !== null) return refuse({ reason: `${path} crosses a symbolic link.`, remedy: projectionLinkRemedy(linked) });
  const gate = await gateRead({ path: join(root.checkout, path), markdown: false });
  if (gate.kind === "absent") return refuse({ reason: `No file exists at ${path}.`,
    remedy: stored ? { text: "Run arc sync to restore the deleted projected file, then retry arc edit.", argv: ["arc", "sync"] }
      : { text: "Create the file in its archived owner's folder first, then run arc edit on that file." } });
  if (gate.kind === "no-edit") return refuse({ reason: `${path} is not a regular file.`,
    remedy: gate.deleted === "not-a-file" ? gate.remedy : { text: "Restore a regular file, then retry arc edit." } });
  if (gate.kind === "pending") return refuse({ reason: `${path} is still being saved (${gate.reason}).`,
    remedy: { text: "Let the editor finish saving, then retry arc edit." } });
  return gate;
}
