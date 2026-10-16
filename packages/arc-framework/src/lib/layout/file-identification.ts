/** Invert file addresses without assigning directory paths a fabricated owner. */
import { identifyWorkUnitArtifactPath } from "./identification.js";
import { ArcLayoutAddressSchema, type ArcLayoutAddress } from "./schema.js";
import { resolveArcPath } from "./projection.js";
/** Recognize a managed file by reading coordinates and confirming them through the projection. */
export function identifyArcFileAddress(path: string): ArcLayoutAddress | null {
  const artifact = identifyWorkUnitArtifactPath(path);
  if (artifact !== null) return { kind: "work-unit-artifact", ...artifact };
  const guesses = [...internalFiles(path), ...userFiles(path), ...cohortFiles(path)];
  if (path === ".arc/backlog/ATOMIC-INBOX.md") guesses.push({ kind: "inbox", scope: { kind: "project" } });
  if (path === ".arc/backlog/ROADMAP.md") guesses.push({ kind: "project-document", document: "roadmap" });
  for (const guess of guesses) {
    const parsed = ArcLayoutAddressSchema.safeParse(guess);
    if (parsed.success && resolveArcPath(parsed.data) === path) return parsed.data;
  }
  return null;
}
function internalFiles(path: string): unknown[] {
  const guesses: unknown[] = [];
  const boundary = /^\.arc\/system\/\.internal\/candidates\/(.+)\.boundary\.json$/u.exec(path);
  if (boundary !== null) guesses.push({ kind: "integration-boundary-record", slug: boundary[1] });
  const candidate = /^\.arc\/system\/\.internal\/candidates\/(.+)\.json$/u.exec(path);
  if (candidate !== null) guesses.push({ kind: "candidate-record", slug: candidate[1] });
  const transition = /^\.arc\/system\/\.internal\/transitions\/(.+)\.json$/u.exec(path);
  if (transition !== null) guesses.push({ kind: "transition-record", origin: transition[1] });
  const editor = /^\.arc\/system\/\.internal\/schemas\/(.+)\.schema\.json$/u.exec(path);
  if (editor !== null) guesses.push({ kind: "editor-document", schema: editor[1] });
  return guesses;
}
function userFiles(path: string): unknown[] {
  const parts = path.split("/");
  if (parts[0] !== ".arc" || parts[1] !== "user") return [];
  const identity = parts[2], file = parts.at(-1);
  if (parts.length === 4 && file === "USER-INBOX.md") return [{ kind: "inbox", scope: { kind: "identity", identity } }];
  if (parts.length === 4 && file === "WORKING-MEMORY.md") return [{ kind: "user-document", identity, document: { kind: "working-memory" } }];
  if (parts.length === 5 && file === "SESSION-NOTES.md") return [{ kind: "user-document", identity, document: { kind: "session-notes", workUnit: parts[3] } }];
  return [];
}
function cohortFiles(path: string): unknown[] {
  const planned = /^\.arc\/backlog\/planned\/(.+)\/cohort-([^/]+)\.md$/u.exec(path);
  if (planned?.[1] !== undefined) return [{ kind: "cohort-document", cohort: planned[1].split("/"), placement: { kind: "planned" } }];
  const completed = /^\.arc\/completed\/([^/]+)\/([0-9]+)([ab])_cohort-([^/]+)\/cohort-([^/]+)\.md$/u.exec(path);
  if (completed === null) return [];
  return [{ kind: "cohort-document", cohort: [completed[4]], placement: { kind: "completed", quarter: completed[1], sequence: completed[2], closeout: completed[3] === "a" ? "leaf" : "parent" } }];
}
