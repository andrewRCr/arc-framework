/** Present command-scoped projection diagnostics without writing to stdout. */
import type { Store } from "../contract.js";
import { storeRemedyText } from "../native-refusal.js";
import { formatConflictToken } from "../../status/conflict-token.js";
import { projectionProcessState } from "./process-state.js";
import type { CopySettlement } from "./aside-copies.js";
import { projectionLinkRemedy } from "./discovery-links.js";

/** Flush only new notices, diagnostics, and resolutions at command entry and completion. */
export function createProjectionReporter(store: Pick<Store, "capabilities">,
  writeError: (text: string) => void = text => { process.stderr.write(text); }): () => void {
  let diagnostics = 0;
  let resolutions = 0;
  let notices = 0;
  return () => {
    const state = projectionProcessState();
    for (const notice of state.notices.slice(notices)) writeError(`projection: ${notice}\n`);
    for (const diagnostic of state.diagnostics.slice(diagnostics)) {
      writeError(`projection: ${locus(diagnostic.path, diagnostic.copy)}: ${diagnostic.mark.reason}\n  ${storeRemedyText(store, diagnostic.mark.remedy)}\n`);
    }
    for (const resolution of state.resolutions.slice(resolutions)) {
      writeError(`projection: ${locus(resolution.path, resolution.copy)}: resolved ${formatConflictToken(resolution.reference)}\n`);
    }
    diagnostics = state.diagnostics.length;
    resolutions = state.resolutions.length;
    notices = state.notices.length;
  };
}

/** Retain the path and copy when settlement leaves a save for the person or a later command. */
export function reportProjectionCopy(path: string, copy: string, settlement: CopySettlement): void {
  const kind = settlement.kind;
  if (kind !== "moved-on" && kind !== "held-aside" && kind !== "kept" && kind !== "not-a-file") return;
  const mark = kind === "not-a-file" ? { reason: kind, remedy: settlement.remedy }
    : { reason: kind === "kept" ? `${kind}: ${settlement.answer}` : kind,
      remedy: { text: kind === "moved-on" || kind === "held-aside"
        ? "The original path changed. Recover anything wanted from this aside copy, then remove the copy explicitly."
        : "Keep this aside copy; the next command will retry once the save has settled or its refusal is repaired." } };
  projectionProcessState().diagnostics.push({ path, copy, mark });
}

/** Report unfollowed links without recording them as ownerless files or pending edits. */
export function reportProjectionLinks(paths: readonly string[]): void {
  for (const path of paths) projectionProcessState().diagnostics.push({ path, copy: null,
    mark: { reason: "not-a-file", remedy: projectionLinkRemedy(path) } });
}

function locus(path: string, copy: string | null): string {
  return copy === null ? path : `${path} (aside copy ${copy})`;
}
