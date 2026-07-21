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

/** Select one per-session process without crossing an ambiguous ancestor. */
export function selectSessionAnchor(
  snapshots: readonly AncestorProcessSnapshot[],
  inspector = "unbound",
): SelectedSessionAnchor {
  if (snapshots.length === 0) return unverifiable("Process ancestry is unavailable");
  if (snapshots.length > MAX_ANCESTOR_DEPTH) return unverifiable("Process ancestry exceeds 32 entries");

  const candidates: Array<{ snapshot: AncestorProcessSnapshot; selector: string }> = [];
  for (const snapshot of snapshots) {
    const selector = harnessSelector(snapshot.commandIdentity);
    if (selector !== null) {
      candidates.push({ snapshot, selector });
      continue;
    }
    if (isInteractiveShell(snapshot)) {
      candidates.push({ snapshot, selector: "interactive-shell" });
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
  if ((executable === "npm" || executable === "npm.cmd" || snapshot.commandIdentity.toLowerCase() === "npm exec")
    && /\b(?:exec|run)\b.*\barc\b/u.test(commandLine)) return true;
  return (executable === "npx" || executable === "npx.cmd") && /\barc\b/u.test(commandLine);
}

function basename(identity: string): string {
  const segments = identity.replaceAll("\\", "/").split("/");
  return segments.at(-1) ?? identity;
}

function unverifiable(reason: string): { kind: "unverifiable"; reason: string } {
  return { kind: "unverifiable", reason };
}
