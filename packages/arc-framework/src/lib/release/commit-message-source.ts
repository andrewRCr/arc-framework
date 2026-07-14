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
  z: { operand: "none", role: "ordinary" },
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
      reason: "unsupported-grammar" | "message-modifier" | "git-managed-message";
    };

/** Inputs needed to classify a release-commit invocation. */
export interface ClassifyCommitMessageInputOptions {
  args: readonly string[];
  stdinIsTTY: boolean;
  commitCleanup?: string | null;
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
};

const LONG_ORDINARY_OPTIONS: ReadonlySet<string> = new Set([
  "--all",
  "--patch",
  "--interactive",
  "--include",
  "--only",
  "--quiet",
  "--verbose",
  "--no-verify",
  "--dry-run",
  "--short",
  "--branch",
  "--porcelain",
  "--long",
  "--null",
  "--status",
  "--no-status",
  "--allow-empty",
  "--allow-empty-message",
  "--reset-author",
  "--no-post-rewrite",
  "--pathspec-file-nul",
  "--no-gpg-sign",
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

  for (let index = 0; index < options.args.length; index += 1) {
    const arg = options.args[index];
    if (arg === undefined) break;
    if (arg === "--") break;
    if (!arg.startsWith("-") || arg === "-") continue;

    if (arg.startsWith("--")) {
      if (applyLongOption(state, arg, options.args, index)) index += 1;
      continue;
    }

    const walk = walkCommitShortOption(arg, options.args[index + 1]);
    if (walk.kind === "unsupported") {
      state.unsupported = true;
      continue;
    }
    for (const member of walk.members) applyShortMember(state, member);
    if (walk.consumedNext) index += 1;
  }

  const hasMessages = state.messages.length > 0;
  const hasFiles = state.files.length > 0;
  const hasExplicitSource = hasMessages || hasFiles;
  const sourceGrammarValid =
    !state.invalidSource &&
    ((hasMessages && !hasFiles) || (!hasMessages && state.files.length === 1));

  if (
    state.unsupported ||
    state.invalidSource ||
    (hasMessages && hasFiles) ||
    state.files.length > 1 ||
    (hasExplicitSource && state.sourceExclusiveMessage)
  ) {
    return { kind: "pass-through", reason: "unsupported-grammar" };
  }

  if (sourceGrammarValid && !state.messageModifier && !state.gitManagedMessage) {
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

  if (state.messageModifier) return { kind: "pass-through", reason: "message-modifier" };
  return { kind: "pass-through", reason: "git-managed-message" };
}
