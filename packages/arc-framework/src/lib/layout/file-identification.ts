/** Invert file addresses without assigning directory paths a fabricated owner. */
import { identifyWorkUnitArtifactPath, identifyWorkUnitFileAddress, type ActiveLayoutContext } from "./identification.js";
import { ArcLayoutAddressSchema, type ArcLayoutAddress } from "./schema.js";
import { resolveArcPath } from "./projection.js";
/** Caller-established work-item ownership and the checkout's own active coordinates. */
export interface FileAddressContext {
  readonly active?: ActiveLayoutContext;
  readonly workItem?: Extract<ArcLayoutAddress, { kind: "work-unit-container" }>;
}
/**
 * Recognize a file through projection; supplied active context governs the checkout's own folder,
 * while omission retains legacy flat recognition.
 */
export function identifyArcFileAddress(path: string, context: FileAddressContext = {}): ArcLayoutAddress | null {
  if (context.workItem !== undefined) return identifyWorkUnitFileAddress(path, context.workItem);
  const active = context.active;
  const container = activeContainer(path, active);
  if (container !== null) return identifyWorkUnitFileAddress(path, container);
  const artifact = identifyWorkUnitArtifactPath(path, active);
  if (artifact !== null) return { kind: "work-unit-artifact", ...artifact };
  const guesses = [...internalFiles(path), ...userFiles(path), ...cohortFiles(path), ...completedErrands(path)];
  if (path === ".arc/backlog/ATOMIC-INBOX.md") guesses.push({ kind: "inbox", scope: { kind: "project" } });
  if (path === ".arc/backlog/ROADMAP.md") guesses.push({ kind: "project-document", document: "roadmap" });
  for (const guess of guesses) {
    const parsed = ArcLayoutAddressSchema.safeParse(guess);
    if (parsed.success && resolveArcPath(parsed.data) === path) return parsed.data;
  }
  return null;
}

function activeContainer(path: string, active?: ActiveLayoutContext): Extract<ArcLayoutAddress, { kind: "work-unit-container" }> | null {
  const other = /^\.arc\/active\/in-flight\/([^/]+)\//u.exec(path);
  if (other !== null) {
    const parsed = ArcLayoutAddressSchema.safeParse({ kind: "work-unit-container", slug: other[1],
      placement: { kind: "active", scope: { kind: "project", location: { kind: "another" } } } });
    return parsed.success && parsed.data.kind === "work-unit-container" ? parsed.data : null;
  }
  const own = active?.claim === undefined || active.claim === null ? null : ArcLayoutAddressSchema.safeParse({
    kind: "work-unit-container", slug: active.claim,
    placement: { kind: "active", scope: { kind: "project", location: { kind: "own", ...active } } },
  });
  if (own?.success && own.data.kind === "work-unit-container" && path.startsWith(`${resolveArcPath(own.data)}/`)) return own.data;
  return null;
}

function completedErrands(path: string): unknown[] {
  const match = /^\.arc\/completed\/([^/]+)\/errand-([^/]+)\.md$/u.exec(path);
  return match === null ? [] : [{ kind: "errand-description", slug: match[2], placement: { kind: "completed", quarter: match[1] } }];
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
  if (parts[3] === "scratch") return [{ kind: "scratch-document", identity, key: parts.slice(3).join("/") }];
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
