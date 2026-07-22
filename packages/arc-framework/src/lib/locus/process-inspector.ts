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
  return harnessSelector(snapshot.commandIdentity) ?? (isInteractiveShell(snapshot) ? "interactive-shell" : null);
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

function harnessSelector(identity: string): "codex" | "claude" | "gemini" | null {
  const executable = basename(identity).toLowerCase();
  if (executable === "codex" || executable === "codex.exe") return "codex";
  if (executable === "claude" || executable === "claude.exe") return "claude";
  if (executable === "gemini" || executable === "gemini.exe") return "gemini";
  return null;
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
