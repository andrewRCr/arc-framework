/**
 * Closed classification of commit-message sources accepted by the release wrapper.
 *
 * The classifier recognizes only argument grammar it can interpret without
 * guessing. Unsupported, ambiguous, and invalid forms remain owned by Git.
 *
 * @module
 */

/** The semantic role of a recognized short `git commit` option. */
export type CommitShortOptionRole =
  | "ordinary"
  | "no-commit"
  | "message"
  | "file"
  | "modifier"
  | "edit"
  | "reuse"
  | "reedit"
  | "template";

/** One member recognized while walking a short-option cluster. */
export interface CommitShortOptionMember {
  option: string;
  offset: number;
  role: CommitShortOptionRole;
  operand:
    | { kind: "none" }
    | { kind: "attached"; value: string }
    | { kind: "separated"; value: string }
    | { kind: "missing" };
}

/** Result of walking one short-option token. */
export type CommitShortOptionWalkResult =
  | {
      kind: "recognized";
      members: readonly CommitShortOptionMember[];
      consumedNext: boolean;
    }
  | {
      kind: "unsupported";
      offset: number;
    };

type ShortOptionSpec = {
  operand: "none" | "required" | "ambiguous";
  role: CommitShortOptionRole;
};

const SHORT_OPTIONS: Readonly<Record<string, ShortOptionSpec>> = {
  a: { operand: "none", role: "ordinary" },
  p: { operand: "none", role: "ordinary" },
  q: { operand: "none", role: "ordinary" },
  v: { operand: "none", role: "ordinary" },
  n: { operand: "none", role: "ordinary" },
  o: { operand: "none", role: "ordinary" },
  i: { operand: "none", role: "ordinary" },
  z: { operand: "none", role: "no-commit" },
  s: { operand: "none", role: "modifier" },
  e: { operand: "none", role: "edit" },
  m: { operand: "required", role: "message" },
  F: { operand: "required", role: "file" },
  C: { operand: "required", role: "reuse" },
  c: { operand: "required", role: "reedit" },
  t: { operand: "required", role: "template" },
  S: { operand: "ambiguous", role: "ordinary" },
  u: { operand: "ambiguous", role: "ordinary" },
};

/**
 * Walk one short `git commit` option token using the classifier's closed table.
 * Required-operand members terminate the cluster and consume either the token
 * remainder or `nextArg`. Optional/ambiguous and unknown members are unsupported.
 *
 * @param token - A candidate short-option token such as `-qammessage`.
 * @param nextArg - The following argv token, when present.
 * @returns The recognized members or the first unsupported cluster offset.
 */
export function walkCommitShortOption(
  token: string,
  nextArg: string | undefined,
): CommitShortOptionWalkResult {
  if (!token.startsWith("-") || token.startsWith("--") || token === "-") {
    return { kind: "unsupported", offset: 0 };
  }

  const members: CommitShortOptionMember[] = [];
  for (let offset = 1; offset < token.length; offset += 1) {
    const option = token[offset];
    if (option === undefined) break;
    const spec = SHORT_OPTIONS[option];
    if (spec === undefined || spec.operand === "ambiguous") {
      return { kind: "unsupported", offset };
    }

    if (spec.operand === "none") {
      members.push({ option, offset, role: spec.role, operand: { kind: "none" } });
      continue;
    }

    const attached = token.slice(offset + 1);
    if (attached.length > 0) {
      members.push({
        option,
        offset,
        role: spec.role,
        operand: { kind: "attached", value: attached },
      });
      return { kind: "recognized", members, consumedNext: false };
    }
    if (nextArg !== undefined) {
      members.push({
        option,
        offset,
        role: spec.role,
        operand: { kind: "separated", value: nextArg },
      });
      return { kind: "recognized", members, consumedNext: true };
    }
    members.push({ option, offset, role: spec.role, operand: { kind: "missing" } });
    return { kind: "recognized", members, consumedNext: false };
  }

  return { kind: "recognized", members, consumedNext: false };
}

/** A deterministic message source the wrapper can assemble before invoking Git. */
export type AssembledCommitMessageSource =
  | { kind: "messages"; values: readonly string[] }
  | { kind: "file"; path: string };

/** Closed classification result for release-commit message input. */
export type CommitMessageInputClassification =
  | { kind: "assembled"; source: AssembledCommitMessageSource }
  | { kind: "refused"; reason: "editor-required" }
  | {
      kind: "pass-through";
      reason:
        | "unsupported-grammar"
        | "unsupported-encoding"
        | "message-modifier"
        | "git-managed-message";
    };

/** Inputs needed to classify a release-commit invocation. */
export interface ClassifyCommitMessageInputOptions {
  args: readonly string[];
  stdinIsTTY: boolean;
  commitCleanup?: string | null;
  commitEncoding?: string | null;
}

type ScanState = {
  messages: string[];
  files: string[];
  invalidSource: boolean;
  unsupported: boolean;
  messageModifier: boolean;
  gitManagedMessage: boolean;
  explicitEditor: boolean;
  sourceFreeEditor: boolean;
  editorFreeMessage: boolean;
  sourceExclusiveMessage: boolean;
  noCommit: boolean;
};

const LONG_ORDINARY_OPTIONS: ReadonlySet<string> = new Set([
  "--amend",
  "--all",
  "--patch",
  "--interactive",
  "--include",
  "--only",
  "--quiet",
  "--verbose",
  "--no-verify",
  "--branch",
  "--status",
  "--no-status",
  "--allow-empty",
  "--allow-empty-message",
  "--reset-author",
  "--no-post-rewrite",
  "--pathspec-file-nul",
  "--no-gpg-sign",
]);

const LONG_NO_COMMIT_OPTIONS: ReadonlySet<string> = new Set([
  "--dry-run",
  "--short",
  "--porcelain",
  "--long",
  "--null",
]);

const LONG_ORDINARY_REQUIRED: ReadonlySet<string> = new Set([
  "--author",
  "--date",
  "--pathspec-from-file",
]);

const LONG_AMBIGUOUS_OPTIONS: ReadonlySet<string> = new Set([
  "--gpg-sign",
  "--untracked-files",
]);

// Include specialized options alongside the grouped grammar for prefix resolution.
const LONG_OPTION_NAMES: ReadonlySet<string> = new Set([
  ...LONG_ORDINARY_OPTIONS,
  ...LONG_NO_COMMIT_OPTIONS,
  ...LONG_ORDINARY_REQUIRED,
  ...LONG_AMBIGUOUS_OPTIONS,
  "--message",
  "--file",
  "--signoff",
  "--edit",
  "--no-edit",
  "--cleanup",
  "--trailer",
  "--reuse-message",
  "--reedit-message",
  "--template",
  "--fixup",
  "--squash",
]);

function createScanState(commitCleanup: string | null | undefined): ScanState {
  return {
    messages: [],
    files: [],
    invalidSource: false,
    unsupported: false,
    messageModifier: commitCleanup !== undefined && commitCleanup !== null && commitCleanup !== "default",
    gitManagedMessage: false,
    explicitEditor: false,
    sourceFreeEditor: false,
    editorFreeMessage: false,
    sourceExclusiveMessage: false,
    noCommit: false,
  };
}

function memberOperandValue(member: CommitShortOptionMember): string | undefined {
  return member.operand.kind === "attached" || member.operand.kind === "separated"
    ? member.operand.value
    : undefined;
}

function applyShortMember(state: ScanState, member: CommitShortOptionMember): void {
  const value = memberOperandValue(member);
  if (member.operand.kind === "missing") {
    state.invalidSource = true;
    return;
  }

  switch (member.role) {
    case "message":
      if (value !== undefined) state.messages.push(value);
      break;
    case "file":
      if (value !== undefined) state.files.push(value);
      break;
    case "modifier":
      state.messageModifier = true;
      break;
    case "edit":
      state.messageModifier = true;
      state.explicitEditor = true;
      break;
    case "reuse":
      state.gitManagedMessage = true;
      state.editorFreeMessage = true;
      state.sourceExclusiveMessage = true;
      break;
    case "reedit":
      state.gitManagedMessage = true;
      state.explicitEditor = true;
      state.sourceExclusiveMessage = true;
      break;
    case "template":
      state.gitManagedMessage = true;
      state.sourceFreeEditor = true;
      break;
    case "ordinary":
      break;
    case "no-commit":
      state.noCommit = true;
      break;
  }
}

function splitLongOption(arg: string): { name: string; attached: string | undefined } {
  const separator = arg.indexOf("=");
  return separator === -1
    ? { name: arg, attached: undefined }
    : { name: arg.slice(0, separator), attached: arg.slice(separator + 1) };
}

function takeRequiredLongOperand(
  attached: string | undefined,
  args: readonly string[],
  index: number,
): { value: string | undefined; consumedNext: boolean } {
  if (attached !== undefined) return { value: attached, consumedNext: false };
  return { value: args[index + 1], consumedNext: args[index + 1] !== undefined };
}

function isUtf8Encoding(label: string | null | undefined): boolean {
  try {
    return new TextDecoder(label ?? "utf-8").encoding === "utf-8";
  } catch {
    return false;
  }
}

function applyLongOption(state: ScanState, arg: string, args: readonly string[], index: number): boolean {
  const { name, attached } = splitLongOption(arg);

  if (name === "--message" || name === "--file") {
    const operand = takeRequiredLongOperand(attached, args, index);
    if (operand.value === undefined || name.startsWith("--no-")) {
      state.invalidSource = true;
    } else if (name === "--message") {
      state.messages.push(operand.value);
    } else {
      state.files.push(operand.value);
    }
    return operand.consumedNext;
  }

  if (name === "--signoff" || name === "--edit") {
    if (attached !== undefined) {
      state.unsupported = true;
      return false;
    }
    state.messageModifier = true;
    if (name === "--edit") state.explicitEditor = true;
    return false;
  }

  if (name === "--no-edit") {
    if (attached !== undefined) state.unsupported = true;
    state.editorFreeMessage = true;
    return false;
  }

  if (name === "--cleanup" || name === "--trailer") {
    const operand = takeRequiredLongOperand(attached, args, index);
    if (operand.value === undefined) state.unsupported = true;
    state.messageModifier = true;
    return operand.consumedNext;
  }

  if (name === "--reuse-message" || name === "--reedit-message" || name === "--template") {
    const operand = takeRequiredLongOperand(attached, args, index);
    if (operand.value === undefined) {
      state.invalidSource = true;
      return false;
    }
    state.gitManagedMessage = true;
    if (name === "--reuse-message") state.editorFreeMessage = true;
    if (name === "--reuse-message" || name === "--reedit-message") {
      state.sourceExclusiveMessage = true;
    }
    if (name === "--reedit-message") state.explicitEditor = true;
    if (name === "--template") state.sourceFreeEditor = true;
    return operand.consumedNext;
  }

  if (name === "--fixup" || name === "--squash") {
    const operand = takeRequiredLongOperand(attached, args, index);
    if (operand.value === undefined) {
      state.invalidSource = true;
      return false;
    }
    state.messageModifier = true;
    state.gitManagedMessage = true;
    if (name === "--squash") {
      state.sourceFreeEditor = true;
    } else if (operand.value.startsWith("amend:") || operand.value.startsWith("reword:")) {
      state.explicitEditor = true;
      state.sourceExclusiveMessage = true;
    } else {
      state.editorFreeMessage = true;
    }
    return operand.consumedNext;
  }

  if (LONG_NO_COMMIT_OPTIONS.has(name)) {
    if (attached !== undefined) state.unsupported = true;
    state.noCommit = true;
    return false;
  }

  if (LONG_ORDINARY_OPTIONS.has(name)) {
    if (attached !== undefined) state.unsupported = true;
    return false;
  }

  if (LONG_ORDINARY_REQUIRED.has(name)) {
    const operand = takeRequiredLongOperand(attached, args, index);
    if (operand.value === undefined) state.unsupported = true;
    return operand.consumedNext;
  }

  if (LONG_AMBIGUOUS_OPTIONS.has(name)) {
    state.unsupported = true;
    return false;
  }

  state.unsupported = true;
  return false;
}

/** Report whether a token names an exact long option in the closed commit grammar. */
export function isExactCommitLongOption(token: string): boolean {
  return LONG_OPTION_NAMES.has(splitLongOption(token).name);
}

function resolveLongOperandOption(token: string): string | null {
  const { name, attached } = splitLongOption(token);
  if (isExactCommitLongOption(token)) return token;
  const matches = [...LONG_OPTION_NAMES].filter((option) => option.startsWith(name));
  const canonical = matches.length === 1 ? matches[0] : undefined;
  if (canonical === undefined) return null;
  return attached === undefined ? canonical : `${canonical}=${attached}`;
}

/**
 * Report whether an exact or unambiguously abbreviated commit option consumes
 * the following argv token. Ambiguous and unknown options consume nothing.
 *
 * @param token - Candidate short or long commit option.
 * @param nextArg - Following argv token, when present.
 * @returns Whether the recognized option consumes `nextArg` as its operand.
 */
export function commitOptionConsumesNext(token: string, nextArg: string | undefined): boolean {
  if (token.startsWith("--")) {
    const option = resolveLongOperandOption(token);
    if (option === null) return false;
    const state = createScanState(undefined);
    return applyLongOption(state, option, nextArg === undefined ? [option] : [option, nextArg], 0);
  }
  const walk = walkCommitShortOption(token, nextArg);
  return walk.kind === "recognized" && walk.consumedNext;
}

function scanCommitOptions(args: readonly string[], state: ScanState): void {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined || arg === "--") break;
    if (!arg.startsWith("-") || arg === "-") continue;

    if (scanCommitOption(args, index, arg, state)) index += 1;
  }
}

function scanCommitOption(args: readonly string[], index: number, arg: string, state: ScanState): boolean {
  if (arg.startsWith("--")) return applyLongOption(state, arg, args, index);
  const walk = walkCommitShortOption(arg, args[index + 1]);
  if (walk.kind === "unsupported") { state.unsupported = true; return false; }
  for (const member of walk.members) applyShortMember(state, member);
  return walk.consumedNext;
}

/**
 * Classify the commit-message input represented by `args`.
 *
 * @param options - Invocation argv, stdin TTY state, and resolved cleanup config.
 * @returns An assembled source, a non-interactive editor refusal, or pass-through.
 */
export function classifyCommitMessageInput(
  options: ClassifyCommitMessageInputOptions,
): CommitMessageInputClassification {
  const state = createScanState(options.commitCleanup);

  scanCommitOptions(options.args, state);

  const hasMessages = state.messages.length > 0;
  const hasFiles = state.files.length > 0;
  const hasExplicitSource = hasMessages || hasFiles;
  const sourceGrammarValid =
    !state.invalidSource &&
    ((hasMessages && !hasFiles) || (!hasMessages && state.files.length === 1));
  const messageEncodingUnsupported =
    hasMessages &&
    (!isUtf8Encoding(options.commitEncoding) || state.messages.some((value) => value.includes("\uFFFD")));

  if (
    state.unsupported ||
    state.invalidSource ||
    (hasMessages && hasFiles) ||
    state.files.length > 1 ||
    (hasExplicitSource && state.sourceExclusiveMessage)
  ) {
    return { kind: "pass-through", reason: "unsupported-grammar" };
  }

  if (state.noCommit) {
    return { kind: "pass-through", reason: "git-managed-message" };
  }

  if (
    sourceGrammarValid &&
    !messageEncodingUnsupported &&
    !state.messageModifier &&
    !state.gitManagedMessage
  ) {
    return hasMessages
      ? { kind: "assembled", source: { kind: "messages", values: state.messages } }
      : { kind: "assembled", source: { kind: "file", path: state.files[0] ?? "" } };
  }

  const editorRequired =
    state.explicitEditor ||
    (!hasExplicitSource && state.sourceFreeEditor) ||
    (!hasExplicitSource && !state.editorFreeMessage);
  if (!options.stdinIsTTY && editorRequired) {
    return { kind: "refused", reason: "editor-required" };
  }

  if (messageEncodingUnsupported) {
    return { kind: "pass-through", reason: "unsupported-encoding" };
  }
  if (state.messageModifier) return { kind: "pass-through", reason: "message-modifier" };
  return { kind: "pass-through", reason: "git-managed-message" };
}

/**
 * Rewrite the single recognized `-F` / `--file` operand while preserving its
 * original separated, attached, long, or clustered option shape.
 *
 * @param args - Caller commit argv already classified as one file source.
 * @param path - Replacement snapshot path.
 * @returns A copied argv with only the file operand replaced.
 */
export function rewriteCommitFileSource(args: readonly string[], path: string): string[] {
  const rewritten = [...args];
  for (let index = 0; index < rewritten.length; index += 1) {
    const arg = rewritten[index];
    if (arg === undefined || arg === "--") break;
    if (arg === "--file") {
      if (index + 1 < rewritten.length) rewritten[index + 1] = path;
      return rewritten;
    }
    if (arg.startsWith("--file=")) {
      rewritten[index] = `--file=${path}`;
      return rewritten;
    }
    if (!arg.startsWith("-") || arg.startsWith("--") || arg === "-") continue;
    const walk = walkCommitShortOption(arg, rewritten[index + 1]);
    if (walk.kind !== "recognized") continue;
    const file = walk.members.find((member) => member.role === "file");
    if (file?.operand.kind === "attached") {
      rewritten[index] = `${arg.slice(0, file.offset + 1)}${path}`;
      return rewritten;
    }
    if (file?.operand.kind === "separated") {
      rewritten[index + 1] = path;
      return rewritten;
    }
    if (walk.consumedNext) index += 1;
  }
  return rewritten;
}

/** The options that supply a commit message, by short-option role and long name. */
interface MessageSourceForms {
  roles: ReadonlySet<CommitShortOptionRole>;
  longOptions: ReadonlySet<string>;
}

const MESSAGE_OPERANDS: MessageSourceForms = {
  roles: new Set(["message"]),
  longOptions: new Set(["--message"]),
};

/** Every message source a prepared file can stand in for; a reused message also carries authorship, so it stays. */
const EVERY_MESSAGE_SOURCE: MessageSourceForms = {
  roles: new Set(["message", "file", "template"]),
  longOptions: new Set(["--message", "--file", "--template"]),
};

const REUSE_ROLES: ReadonlySet<CommitShortOptionRole> = new Set(["reuse", "reedit"]);
const REUSE_LONG_OPTIONS: ReadonlySet<string> = new Set(["--reuse-message", "--reedit-message"]);

/**
 * Rewrite `args` by stripping every recognized `-m` / `--message` message
 * operand and routing the commit message through a snapshot file instead.
 *
 * @param args - Caller commit argv containing zero or more message operands.
 * @param path - Snapshot file path to append via `-F`.
 * @returns A new argv with message operands removed and `-F path` appended.
 */
export function rewriteCommitMessagesToFile(args: readonly string[], path: string): string[] {
  return routeMessageSourcesToFile(args, path, MESSAGE_OPERANDS);
}

/**
 * Replace every message source in `args` (messages, a message file, or a template) with `-F path` ahead of any `--`,
 * keeping every other argument, so a retry repeats the same commit with a prepared message. A reused message (`-C`,
 * `-c`) stays, since it also carries that commit's author and date; see {@link reusesCommitMessage}.
 *
 * @param args - The commit's argv.
 * @param path - Prepared message file to name with `-F`.
 * @returns A new argv whose only message source is `-F path`.
 */
export function replaceCommitMessageSource(args: readonly string[], path: string): string[] {
  return routeMessageSourcesToFile(args, path, EVERY_MESSAGE_SOURCE);
}

/**
 * Report whether `args` reuse another commit's message with `-C`, `-c`, or their long forms, which also carry that
 * commit's author and date. Option operands and tokens after `--` remain data.
 *
 * @param args - The commit's argv.
 * @returns Whether a prepared message file would change the commit's authorship.
 */
export function reusesCommitMessage(args: readonly string[]): boolean {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined || arg === "--") return false;
    if (arg.startsWith("--") && REUSE_LONG_OPTIONS.has(splitLongOption(arg).name)) return true;
    if (!arg.startsWith("--") && arg.startsWith("-") && arg !== "-") {
      const walk = walkCommitShortOption(arg, args[index + 1]);
      if (walk.kind === "recognized" && walk.members.some((member) => REUSE_ROLES.has(member.role))) return true;
    }
    if (commitOptionConsumesNext(arg, args[index + 1])) index += 1;
  }
  return false;
}

/**
 * Copy the long option at `index` into `result` with any separate operand it consumes, or drop it when it is one of
 * `forms`' message sources.
 *
 * @returns How many argv tokens the option spans.
 */
function copyLongOption(result: string[], args: readonly string[], index: number, forms: MessageSourceForms): number {
  const arg = args[index] ?? "";
  if (forms.longOptions.has(splitLongOption(arg).name)) return arg.includes("=") ? 1 : 2;
  result.push(arg);
  const operand = args[index + 1];
  if (operand === undefined || !commitOptionConsumesNext(arg, operand)) return 1;
  result.push(operand);
  return 2;
}

function routeMessageSourcesToFile(args: readonly string[], path: string, forms: MessageSourceForms): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) break;
    if (arg === "--") {
      result.push("-F", path);
      for (let rest = index; rest < args.length; rest += 1) {
        const token = args[rest];
        if (token !== undefined) result.push(token);
      }
      return result;
    }

    if (arg.startsWith("--")) {
      index += copyLongOption(result, args, index, forms) - 1;
      continue;
    }

    if (!arg.startsWith("-") || arg === "-") {
      result.push(arg);
      continue;
    }

    const walk = walkCommitShortOption(arg, args[index + 1]);
    if (walk.kind !== "recognized") {
      result.push(arg);
      continue;
    }

    const sourceMember = walk.members.find((member) => forms.roles.has(member.role));
    if (sourceMember === undefined) {
      result.push(arg);
      if (walk.consumedNext) {
        index += 1;
        const consumed = args[index];
        if (consumed !== undefined) result.push(consumed);
      }
      continue;
    }

    const truncated = arg.slice(0, sourceMember.offset);
    if (truncated !== "-") result.push(truncated);
    if (walk.consumedNext) index += 1;
  }

  result.push("-F", path);
  return result;
}
