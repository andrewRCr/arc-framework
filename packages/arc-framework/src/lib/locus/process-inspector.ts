/** Cross-platform process inspection, anchor selection, and liveness. */

import type { LocusAnchor, LocusProcessAnchor } from "./schema/index.js";

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
  readonly commandArguments?: readonly string[];
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

/**
 * Acquire and select one durable session anchor without walking above it.
 *
 * @param pid - invoking process identifier
 * @param inspector - platform ancestry boundary
 * @returns the selected durable anchor or an unverifiable result
 */
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
    if (isArcWrapper(snapshot)) {
      if (!Number.isSafeInteger(snapshot.parentPid) || snapshot.parentPid <= 0) {
        return unverifiable("Process ancestry ended before a session anchor");
      }
      currentPid = snapshot.parentPid;
      continue;
    }
    if (anchorSelector(snapshot) === null) {
      return unverifiable(`Unrecognized process boundary: ${snapshot.commandIdentity}`);
    }
    return selectSessionAnchor(snapshots, inspector.kind);
  }
  return unverifiable("Process ancestry exceeds 32 entries");
}

/**
 * Select one per-session process without crossing an ambiguous ancestor.
 *
 * @param snapshots - bounded ancestry snapshots from the invoking process upward
 * @param inspector - inspector kind that produced the snapshots
 * @returns the selected durable anchor or an unverifiable result
 */
export function selectSessionAnchor(
  snapshots: readonly AncestorProcessSnapshot[],
  inspector = "unbound",
): SelectedSessionAnchor {
  if (snapshots.length === 0) return unverifiable("Process ancestry is unavailable");
  if (snapshots.length > MAX_ANCESTOR_DEPTH) return unverifiable("Process ancestry exceeds 32 entries");

  const candidates: Array<{ snapshot: AncestorProcessSnapshot; selector: string }> = [];
  for (const snapshot of snapshots) {
    if (isArcWrapper(snapshot)) continue;
    const selector = anchorSelector(snapshot);
    if (selector !== null) {
      candidates.push({ snapshot, selector });
      continue;
    }
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

/**
 * Verify PID generation through the inspector that minted the anchor.
 *
 * @param anchor - recorded process anchor
 * @param inspector - platform process boundary
 * @returns whether the exact process generation is live, dead, or unknown
 */
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
  if (sameProcessAnchor(anchor, ownAnchor)) return "self";
  const liveness = await verifyProcessAnchor(anchor, inspector);
  if (liveness === "dead") return "dead";
  return liveness === "unknown" ? "unverifiable" : "foreign";
}

/**
 * Compare two anchors for exact identity, including how each was selected.
 *
 * PID plus creation token is the pair that defeats PID reuse, and the inspector kind scopes both to
 * one platform's process namespace. `selector` participates too: a differing selector on the same
 * PID means the anchor was reached by a different route, which is weak evidence that the session
 * shape changed underneath it. The asymmetry decides the strictness — a false `foreign` costs a
 * detour through operator confirmation and recovers, while a false `self` releases a lease held by
 * a session that is genuinely someone else's, and does not.
 *
 * This is the single self-test. Frame selection and authority classification both read it, so the
 * two cannot drift into disagreeing about which anchor is the caller's own.
 *
 * @param left - an anchor recorded with a lease or lock, if any
 * @param right - the anchor to compare it against
 * @returns whether both are process anchors naming the same process, selected the same way
 */
export function sameProcessAnchor(
  left: LocusAnchor | null | undefined,
  right: LocusAnchor | null | undefined,
): boolean {
  if (left?.kind !== "process" || right?.kind !== "process") return false;
  return left.pid === right.pid
    && left.startToken === right.startToken
    && left.inspector === right.inspector
    && left.selector === right.selector;
}

function harnessSelector(snapshot: AncestorProcessSnapshot): "codex" | "claude" | "gemini" | null {
  // Native harness installs run versioned binaries (/proc exe resolves to e.g.
  // .../claude/versions/2.1.217), so argv[0] may carry the only recognizable name.
  for (const identity of [
    snapshot.commandIdentity,
    snapshot.commandArguments?.[0] ?? argv0(snapshot.commandLine),
  ]) {
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
  return isShellIdentity(snapshot.commandIdentity);
}

function isArcWrapper(snapshot: AncestorProcessSnapshot): boolean {
  const executable = basename(snapshot.commandIdentity).toLowerCase();
  const commandLine = snapshot.commandLine ?? "";
  const args = snapshot.commandArguments ?? parseCommandArguments(commandLine);
  if ((executable === "node" || executable === "node.exe")
    && args !== null
    && (isArcNodeInvocation(args) || isNpmArcInvocation(args) || isFlattenedNpmArcProcessTitle(args))) return true;
  if ((executable === "npm" || executable === "npm.cmd" || snapshot.commandIdentity.toLowerCase() === "npm exec")
    && args !== null
    && isNpmArcInvocation(args)) return true;
  if ((executable === "npx" || executable === "npx.cmd")
    && args !== null
    && isNpxArcInvocation(args)) return true;
  // Agent-harness tool shells source a session snapshot, then eval the requested
  // command; the arc invocation sits inside the eval payload, not after -c.
  if ((executable === "bash" || executable === "zsh" || executable === "sh" || executable === "dash")
    && isAgentSnapshotShell(snapshot, commandLine)) return true;
  return isShellIdentity(executable) && args !== null && isShellArcInvocation(args);
}

function isAgentSnapshotShell(snapshot: AncestorProcessSnapshot, commandLine: string): boolean {
  const command = snapshot.commandArguments === undefined
    ? shellCommandLineOperand(commandLine)
    : shellCommandOperand(snapshot.commandArguments);
  if (command === null) return false;
  const commands = parseShellCommandList(command);
  if (commands === null || commands.length === 0) return false;
  const source = commands[0];
  if (source?.[0] !== "source" || source[1] === undefined) return false;
  const snapshotPath = source[1].replaceAll("\\", "/");
  if (!/[\\/]shell-snapshots[\\/]snapshot-[^/]+\.sh$/u.test(snapshotPath)) return false;
  const evalIndex = commands.findIndex((words, index) => index > 0 && words[0] === "eval");
  if (evalIndex < 0) return false;
  const setupCommands = commands.slice(1, evalIndex);
  if (!setupCommands.every((words) => words[0] === "true" || words[0] === "shopt")) return false;
  const evalPayload = commands[evalIndex]?.[1];
  if (evalPayload === undefined) return false;
  const evaluatedCommands = parseShellCommandList(evalPayload);
  return evaluatedCommands !== null && evaluatedCommands.some(isDirectArcInvocation);
}

function shellCommandLineOperand(commandLine: string): string | null {
  const matched = /^\s*(?:"[^"]+"|'[^']+'|\S+)\s+-(?:l)?c\s+([\s\S]+)$/u.exec(commandLine);
  if (matched?.[1] === undefined) return null;
  const operand = matched[1].trim();
  const quote = operand[0];
  return quote !== undefined && (quote === "'" || quote === "\"") && operand.at(-1) === quote
    ? operand.slice(1, -1)
    : operand;
}

function shellCommandOperand(args: readonly string[]): string | null {
  const optionIndex = args.findIndex((arg) => {
    const option = arg.toLowerCase();
    return option === "-c" || option === "-lc";
  });
  return optionIndex < 0 ? null : args[optionIndex + 1] ?? null;
}

function parseShellCommandList(script: string): readonly (readonly string[])[] | null {
  const commands: string[][] = [];
  let words: string[] = [];
  let token = "";
  let tokenStarted = false;
  let quote: "'" | "\"" | null = null;

  const finishToken = (): void => {
    if (!tokenStarted) return;
    words.push(token);
    token = "";
    tokenStarted = false;
  };
  const finishCommand = (): void => {
    finishToken();
    if (words.length === 0) return;
    commands.push(words);
    words = [];
  };

  for (let index = 0; index < script.length; index += 1) {
    const character = script[index];
    const following = script[index + 1];
    if (character === undefined) continue;
    if (quote !== null) {
      if (character === quote) {
        quote = null;
        tokenStarted = true;
      } else if (quote === "\"" && character === "\\" && following !== undefined) {
        index += 1;
        token += following;
        tokenStarted = true;
      } else {
        token += character;
        tokenStarted = true;
      }
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      tokenStarted = true;
      continue;
    }
    if (character === "\\" && following !== undefined) {
      index += 1;
      token += following;
      tokenStarted = true;
      continue;
    }
    if (character === "\n" || character === ";" || character === "&" || character === "|") {
      finishCommand();
      if ((character === "&" || character === "|") && script[index + 1] === character) index += 1;
      continue;
    }
    if (/\s/u.test(character)) {
      finishToken();
      continue;
    }
    token += character;
    tokenStarted = true;
  }
  if (quote !== null) return null;
  finishCommand();
  return commands;
}

function isArcNodeInvocation(args: readonly string[]): boolean {
  const executable = args[0] === undefined ? "" : basename(args[0]).toLowerCase();
  if (executable !== "node" && executable !== "node.exe") return false;
  const script = args[1];
  if (script === undefined) return false;
  const normalized = script.replaceAll("\\", "/").toLowerCase();
  const name = basename(normalized);
  return normalized.endsWith("/dist/cli.js") || name === "arc" || name === "arc.js";
}

function isNpmArcInvocation(args: readonly string[]): boolean {
  const executable = args[0] === undefined ? "" : basename(args[0]).toLowerCase();
  if (executable !== "npm" && executable !== "npm.cmd") return false;
  if (args[1] !== "exec" && args[1] !== "run") return false;
  const commandIndex = args[2] === "--" ? 3 : 2;
  return isArcCommand(args[commandIndex]);
}

function isFlattenedNpmArcProcessTitle(args: readonly string[]): boolean {
  if (args.length !== 1 || args[0] === undefined) return false;
  const processTitleArgs = parseCommandArguments(args[0]);
  return processTitleArgs !== null && isNpmArcInvocation(processTitleArgs);
}

function isNpxArcInvocation(args: readonly string[]): boolean {
  const executable = args[0] === undefined ? "" : basename(args[0]).toLowerCase();
  if (executable !== "npx" && executable !== "npx.cmd") return false;
  const commandIndex = args[1] === "--" ? 2 : 1;
  return isArcCommand(args[commandIndex]);
}

function isShellArcInvocation(args: readonly string[]): boolean {
  const optionIndex = args.findIndex((arg) => {
    const option = arg.toLowerCase();
    return option === "-c" || option === "-lc" || option === "-command";
  });
  if (optionIndex < 0) return false;
  const command = args.slice(optionIndex + 1);
  if (isDirectArcInvocation(command)) return true;
  const nested = command[0] === undefined ? null : parseCommandArguments(command[0]);
  return nested !== null && isDirectArcInvocation(nested);
}

function isDirectArcInvocation(command: readonly string[]): boolean {
  if (isArcCommand(command[0])) return true;
  return isNpxArcInvocation(command) || isArcNodeInvocation(command);
}

function isArcCommand(value: string | undefined): boolean {
  if (value === undefined) return false;
  const executable = basename(value).toLowerCase();
  return executable === "arc" || executable === "arc.cmd" || executable === "arc.exe";
}

function isShellIdentity(identity: string): boolean {
  const executable = basename(identity).toLowerCase();
  return executable === "bash" || executable === "zsh" || executable === "fish"
    || executable === "sh" || executable === "dash" || executable === "pwsh"
    || executable === "powershell.exe";
}

function parseCommandArguments(commandLine: string): readonly string[] | null {
  const args: string[] = [];
  let token = "";
  let tokenStarted = false;
  let quote: "'" | "\"" | null = null;
  for (let index = 0; index < commandLine.length; index += 1) {
    const character = commandLine[index];
    if (character === undefined) continue;
    if (quote !== null) {
      if (character === quote) {
        quote = null;
        tokenStarted = true;
      } else {
        token += character;
        tokenStarted = true;
      }
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      tokenStarted = true;
      continue;
    }
    if (/\s/u.test(character)) {
      if (tokenStarted) {
        args.push(token);
        token = "";
        tokenStarted = false;
      }
      continue;
    }
    token += character;
    tokenStarted = true;
  }
  if (quote !== null) return null;
  if (tokenStarted) args.push(token);
  return args;
}

function basename(identity: string): string {
  const segments = identity.replaceAll("\\", "/").split("/");
  return segments.at(-1) ?? identity;
}

function unverifiable(reason: string): { kind: "unverifiable"; reason: string } {
  return { kind: "unverifiable", reason };
}
