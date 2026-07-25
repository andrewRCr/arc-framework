/** Cross-platform process inspection, anchor selection, and liveness. */

import type { LocusProcessAnchor } from "./schema/index.js";

export type ProcessInspection =
  | {
      kind: "present";
      pid: number;
      parentPid: number;
      startToken: string;
      commandIdentity: string;
    }
  | { kind: "absent" }
  | { kind: "unverifiable"; reason: string };

export interface ProcessInspector {
  readonly kind: string;
  inspect(pid: number): Promise<ProcessInspection>;
}

export type AncestorProcessInspection =
  | { kind: "present"; snapshot: AncestorProcessSnapshot }
  | { kind: "absent" }
  | { kind: "unverifiable"; reason: string };

/** Native boundary that exposes the complete evidence needed for anchor selection. */
export interface ProcessAncestryInspector {
  readonly kind: string;
  inspectAncestor(pid: number): Promise<AncestorProcessInspection>;
}

export interface AncestorProcessSnapshot {
  readonly pid: number;
  readonly parentPid: number;
  readonly startToken: string;
  readonly commandIdentity: string;
  readonly commandLine?: string;
  readonly interactive?: boolean;
  readonly controllingTty?: boolean;
}

export type SelectedSessionAnchor = LocusProcessAnchor | { kind: "unverifiable"; reason: string };
export type ProcessLiveness = "live" | "dead" | "unknown";

/**
 * Authority over a recorded lease, orthogonal to the occupancy question liveness answers.
 *
 * `self` is a refinement of `live` rather than a peer of it: the checkout is still occupied, and
 * every guard that reads {@link verifyProcessAnchor} continues to see `live`. Only the paths that
 * decide whether the caller may act on a lease read this axis.
 */
export type LeaseAuthority = "self" | "foreign" | "dead" | "unverifiable";

const MAX_ANCESTOR_DEPTH = 32;

/** Acquire and select one durable session anchor without walking above it. */
export async function acquireSessionAnchor(
  pid: number,
  inspector: ProcessAncestryInspector,
): Promise<SelectedSessionAnchor> {
  if (!Number.isSafeInteger(pid) || pid <= 0) return unverifiable("Invoking process PID is invalid");
  const snapshots: AncestorProcessSnapshot[] = [];
  const seen = new Set<number>();
  let currentPid = pid;
  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth += 1) {
    if (seen.has(currentPid)) return unverifiable("Process ancestry contains a cycle");
    seen.add(currentPid);
    const inspected = await inspector.inspectAncestor(currentPid);
    if (inspected.kind === "unverifiable") return unverifiable(inspected.reason);
    if (inspected.kind === "absent") return unverifiable("Process ancestry ended before a session anchor");
    const snapshot = inspected.snapshot;
    if (snapshot.pid !== currentPid || snapshot.startToken.trim() === ""
      || snapshot.commandIdentity.trim() === "") {
      return unverifiable("Process ancestry evidence is malformed");
    }
    snapshots.push(snapshot);
    if (anchorSelector(snapshot) !== null) return selectSessionAnchor(snapshots, inspector.kind);
    if (!isArcWrapper(snapshot)) {
      return unverifiable(`Unrecognized process boundary: ${snapshot.commandIdentity}`);
    }
    if (!Number.isSafeInteger(snapshot.parentPid) || snapshot.parentPid <= 0) {
      return unverifiable("Process ancestry ended before a session anchor");
    }
    currentPid = snapshot.parentPid;
  }
  return unverifiable("Process ancestry exceeds 32 entries");
}

/** Select one per-session process without crossing an ambiguous ancestor. */
export function selectSessionAnchor(
  snapshots: readonly AncestorProcessSnapshot[],
  inspector = "unbound",
): SelectedSessionAnchor {
  if (snapshots.length === 0) return unverifiable("Process ancestry is unavailable");
  if (snapshots.length > MAX_ANCESTOR_DEPTH) return unverifiable("Process ancestry exceeds 32 entries");

  const candidates: Array<{ snapshot: AncestorProcessSnapshot; selector: string }> = [];
  for (const snapshot of snapshots) {
    const selector = anchorSelector(snapshot);
    if (selector !== null) {
      candidates.push({ snapshot, selector });
      continue;
    }
    if (isArcWrapper(snapshot)) continue;
    if (candidates.length === 0) {
      return unverifiable(`Unrecognized process boundary: ${snapshot.commandIdentity}`);
    }
  }

  if (candidates.length !== 1) {
    return unverifiable(candidates.length === 0
      ? "No bounded interactive session process was found"
      : "Multiple plausible session processes were found");
  }
  const candidate = candidates[0];
  if (candidate === undefined) return unverifiable("Session process is unavailable");
  return {
    kind: "process",
    pid: candidate.snapshot.pid,
    startToken: candidate.snapshot.startToken,
    inspector,
    selector: candidate.selector,
  };
}

function anchorSelector(snapshot: AncestorProcessSnapshot): string | null {
  return harnessSelector(snapshot) ?? (isInteractiveShell(snapshot) ? "interactive-shell" : null);
}

/** Verify PID generation through the inspector that minted the anchor. */
export async function verifyProcessAnchor(
  anchor: LocusProcessAnchor,
  inspector: ProcessInspector,
): Promise<ProcessLiveness> {
  if (anchor.inspector !== inspector.kind) return "unknown";
  const inspected = await inspector.inspect(anchor.pid);
  if (inspected.kind === "unverifiable") return "unknown";
  if (inspected.kind === "absent") return "dead";
  return inspected.pid === anchor.pid && inspected.startToken === anchor.startToken ? "live" : "dead";
}

/**
 * Classify authority over a recorded anchor.
 *
 * Self-identification is a structural comparison against the anchor this process would select now,
 * so it needs no inspection and holds where inspection cannot reach — an unreadable process table
 * or a differing inspector kind. It is checked first for exactly that reason: it is the one verdict
 * whose evidence the caller already owns, and it is strictly stronger than deadness, since the
 * process asserting it is the one whose exit every other exit waits on.
 *
 * @param anchor - the anchor recorded with the lease
 * @param inspector - machine-local process inspector for the running platform
 * @param ownAnchor - the anchor this process would select now
 * @returns which authority, if any, the caller holds over the recorded lease
 */
export async function classifyLeaseAuthority(
  anchor: LocusProcessAnchor,
  inspector: ProcessInspector,
  ownAnchor: SelectedSessionAnchor,
): Promise<LeaseAuthority> {
  if (isSameProcessAnchor(anchor, ownAnchor)) return "self";
  const liveness = await verifyProcessAnchor(anchor, inspector);
  if (liveness === "dead") return "dead";
  return liveness === "unknown" ? "unverifiable" : "foreign";
}

/**
 * Compare two anchors by process identity alone.
 *
 * PID plus creation token is the pair that defeats PID reuse, and the inspector kind scopes both to
 * one platform's namespace. `selector` describes how an anchor was chosen rather than which process
 * it names, so comparing it would reject the same process reached by a different route.
 */
function isSameProcessAnchor(anchor: LocusProcessAnchor, own: SelectedSessionAnchor): boolean {
  return own.kind === "process"
    && own.inspector === anchor.inspector
    && own.pid === anchor.pid
    && own.startToken === anchor.startToken;
}

function harnessSelector(snapshot: AncestorProcessSnapshot): "codex" | "claude" | "gemini" | null {
  // Native harness installs run versioned binaries (/proc exe resolves to e.g.
  // .../claude/versions/2.1.217), so argv[0] may carry the only recognizable name.
  for (const identity of [snapshot.commandIdentity, argv0(snapshot.commandLine)]) {
    if (identity === null) continue;
    const executable = basename(identity).toLowerCase();
    if (executable === "codex" || executable === "codex.exe") return "codex";
    if (executable === "claude" || executable === "claude.exe") return "claude";
    if (executable === "gemini" || executable === "gemini.exe") return "gemini";
  }
  return null;
}

function argv0(commandLine: string | undefined): string | null {
  const first = commandLine?.trimStart().split(/\s/u, 1)[0];
  return first === undefined || first === "" ? null : first;
}

function isInteractiveShell(snapshot: AncestorProcessSnapshot): boolean {
  if (snapshot.interactive !== true || snapshot.controllingTty !== true) return false;
  const executable = basename(snapshot.commandIdentity).toLowerCase();
  return executable === "bash" || executable === "zsh" || executable === "fish"
    || executable === "sh" || executable === "pwsh" || executable === "powershell.exe";
}

function isArcWrapper(snapshot: AncestorProcessSnapshot): boolean {
  const executable = basename(snapshot.commandIdentity).toLowerCase();
  const commandLine = snapshot.commandLine ?? "";
  if ((executable === "node" || executable === "node.exe")
    && /(?:^|[\\/])(?:dist[\\/]cli\.js|arc(?:\.js)?)\b/u.test(commandLine)) return true;
  if ((executable === "node" || executable === "node.exe")
    && /^npm(?:\.cmd)?\s+(?:exec|run)\s+(?:--\s+)?arc\b/u.test(commandLine)) return true;
  if ((executable === "npm" || executable === "npm.cmd" || snapshot.commandIdentity.toLowerCase() === "npm exec")
    && /\b(?:exec|run)\b.*\barc\b/u.test(commandLine)) return true;
  if ((executable === "npx" || executable === "npx.cmd") && /\barc\b/u.test(commandLine)) return true;
  // Agent-harness tool shells source a session snapshot, then eval the requested
  // command; the arc invocation sits inside the eval payload, not after -c.
  if ((executable === "bash" || executable === "zsh" || executable === "sh" || executable === "dash")
    && /\s-c\s+source\s+\S*[\\/]shell-snapshots[\\/]snapshot-\S+\.sh(?:\s|$)/u.test(commandLine)
    && /\beval\s+["'](?:[\s\S]*?(?:&&|;|\|)\s*)?(?:npx\s+arc\b|arc\b|node\s+\S*(?:dist[\\/]cli\.js|arc(?:\.js)?))/u
      .test(commandLine)) return true;
  return (executable === "bash" || executable === "zsh" || executable === "sh" || executable === "dash"
    || executable === "pwsh" || executable === "powershell.exe")
    && /\s-(?:l)?c\s+(?:npx\s+arc\b|arc\b|["']arc["'](?=\s|$)|node\s+\S*(?:dist[\\/]cli\.js|arc(?:\.js)?))/u
      .test(commandLine);
}

function basename(identity: string): string {
  const segments = identity.replaceAll("\\", "/").split("/");
  return segments.at(-1) ?? identity;
}

function unverifiable(reason: string): { kind: "unverifiable"; reason: string } {
  return { kind: "unverifiable", reason };
}
