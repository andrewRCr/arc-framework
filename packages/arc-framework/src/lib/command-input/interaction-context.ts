/**
 * Adapter-bound interaction and confirmation policy for one CLI invocation.
 */

/** How a command-local `--yes` spelling participates in authority. */
export type YesSignal = "absent" | "compatibility" | "authority";

/** Process and invocation facts used exactly once at the CLI boundary. */
export interface InteractionSignals {
  readonly noInput: boolean;
  readonly machineReadable: boolean;
  readonly ci: boolean;
  readonly promptInputIsTTY: boolean;
  readonly promptOutputIsTTY: boolean;
  readonly yes: YesSignal;
}

/** Per-invocation prompt streams retained by prompt adapters. */
export interface PromptStreams {
  readonly input: NodeJS.ReadStream;
  readonly output: NodeJS.WriteStream;
}

/** Resolved command interaction and affirmative-authority contract. */
export interface InteractionContext {
  readonly interaction: "allowed" | "forbidden";
  /** Raw CI/stream capability, independent from explicit no-input and machine modes. */
  readonly terminal: "interactive" | "non-interactive";
  readonly confirmation: "ask" | "accept";
  readonly machineReadable: boolean;
  readonly promptInput: NodeJS.ReadStream;
  readonly promptOutput: NodeJS.WriteStream;
  readonly subprocess: {
    readonly terminalPrompts: "allowed" | "forbidden";
    readonly presenters: "allowed" | "forbidden";
    readonly ambientStdin: "inherit" | "closed";
  };
}

/** Commander surface needed to resolve inherited and command-local options. */
export interface InteractionCommand {
  readonly opts: () => Readonly<Record<string, unknown>>;
  readonly optsWithGlobals: () => Readonly<Record<string, unknown>>;
}

/** Command-owned declarations that affect interaction resolution. */
export interface CommandInteractionPolicy {
  readonly machineReadable?: boolean | ((options: Readonly<Record<string, unknown>>) => boolean);
  readonly yes?: Exclude<YesSignal, "absent"> | "none";
  readonly environment?: {
    readonly ci: boolean;
    readonly promptInputIsTTY: boolean;
    readonly promptOutputIsTTY: boolean;
  };
  readonly promptInput?: NodeJS.ReadStream;
  readonly promptOutput?: NodeJS.WriteStream;
}

/**
 * Resolve interaction capability independently from affirmative authority.
 *
 * @param signals - Global, environment, stream, machine-mode, and command-local signals.
 * @param streams - Injectable prompt streams, defaulting to the process streams.
 * @returns Immutable per-invocation interaction context.
 */
export function resolveInteractionContext(
  signals: InteractionSignals,
  streams: PromptStreams = { input: process.stdin, output: process.stdout },
): InteractionContext {
  const forbidden = signals.noInput
    || signals.machineReadable
    || signals.ci
    || !signals.promptInputIsTTY
    || !signals.promptOutputIsTTY
    || signals.yes !== "absent";
  const interaction = forbidden ? "forbidden" : "allowed";
  const terminal = signals.ci || !signals.promptInputIsTTY || !signals.promptOutputIsTTY
    ? "non-interactive" as const
    : "interactive" as const;
  const subprocess = Object.freeze({
    terminalPrompts: forbidden ? "forbidden" as const : "allowed" as const,
    presenters: forbidden ? "forbidden" as const : "allowed" as const,
    ambientStdin: forbidden ? "closed" as const : "inherit" as const,
  });
  return Object.freeze({
    interaction,
    terminal,
    confirmation: signals.yes === "authority" ? "accept" : "ask",
    machineReadable: signals.machineReadable,
    promptInput: streams.input,
    promptOutput: streams.output,
    subprocess,
  });
}

/** Resolve live process facts for the adapter-bound interaction context. */
export function resolveProcessInteractionContext(input: {
  readonly noInput: boolean;
  readonly machineReadable: boolean;
  readonly yes: YesSignal;
  readonly promptInput?: NodeJS.ReadStream;
  readonly promptOutput?: NodeJS.WriteStream;
}): InteractionContext {
  const promptInput = input.promptInput ?? process.stdin;
  const promptOutput = input.promptOutput ?? process.stdout;
  return resolveInteractionContext({
    noInput: input.noInput,
    machineReadable: input.machineReadable,
    yes: input.yes,
    ci: process.env.CI === "true",
    promptInputIsTTY: promptInput.isTTY,
    promptOutputIsTTY: promptOutput.isTTY,
  }, { input: promptInput, output: promptOutput });
}

/**
 * Resolve an action command's inherited global options and declared local modes.
 *
 * @param command - Commander action command exposing local and inherited option views.
 * @param policy - Command-owned machine-mode and `--yes` semantics.
 * @returns The invocation's interaction context.
 */
export function resolveCommandInteractionContext(
  command: InteractionCommand,
  policy: CommandInteractionPolicy = {},
): InteractionContext {
  const localOptions = command.opts();
  const globalOptions = command.optsWithGlobals();
  const machineReadable = typeof policy.machineReadable === "function"
    ? policy.machineReadable(localOptions)
    : (policy.machineReadable ?? false);
  const declaredYes = policy.yes ?? "none";
  const yes = declaredYes !== "none" && localOptions.yes === true ? declaredYes : "absent";
  const promptInput = policy.promptInput ?? process.stdin;
  const promptOutput = policy.promptOutput ?? process.stdout;
  const environment = policy.environment ?? {
    ci: process.env.CI === "true",
    promptInputIsTTY: promptInput.isTTY,
    promptOutputIsTTY: promptOutput.isTTY,
  };
  return resolveInteractionContext({
    noInput: globalOptions.noInput === true,
    machineReadable,
    yes,
    ...environment,
  }, { input: promptInput, output: promptOutput });
}

/**
 * Wrap a Commander action so command code receives one pre-resolved interaction context.
 *
 * @param policy - Command-owned interaction declarations.
 * @param action - Command adapter invoked with context followed by Commander values.
 * @returns Commander-compatible action callback.
 */
export function withInteractionContext<Args extends readonly unknown[], Result>(
  policy: CommandInteractionPolicy,
  action: (context: InteractionContext, ...args: Args) => Result,
): (...args: [...Args, InteractionCommand]) => Result {
  return (...args) => {
    const command = args.at(-1) as InteractionCommand | undefined;
    if (command === undefined) throw new TypeError("Interaction action requires a Commander action command");
    return action(resolveCommandInteractionContext(command, policy), ...args.slice(0, -1) as unknown as Args);
  };
}
