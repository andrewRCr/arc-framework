/** Pure transport selection shared by built-CLI invocations and signal plans. */

/** Delivery command paths that print human output unless `--json` opts in. */
const DELIVERY_HUMAN_DEFAULT = [
  "delivery compose",
  "delivery plan abandon",
  "delivery plan from-branch",
  "delivery plan from-tasks",
  "delivery plan inventory schema",
  "delivery transfer export",
  "delivery transfer import",
];

/**
 * Collect leading bare words for command-family matching; flags and other tokens end the prefix.
 *
 * @param args - CLI arguments for the invocation.
 * @returns The space-joined command path.
 */
function commandPath(args: readonly string[]): string {
  const path: string[] = [];
  for (const arg of args) {
    if (!/^[a-z][a-z0-9-]*$/u.test(arg)) break;
    path.push(arg);
  }
  return path.join(" ");
}

/**
 * Report whether an invocation writes a machine-readable payload to stdout.
 *
 * Some commands emit JSON unconditionally and so declare no `--json`; their argv carries
 * nothing else that marks the payload, so the command itself is the signal.
 *
 * @param args - CLI arguments for the invocation.
 * @returns True when stdout carries a machine-readable payload.
 */
export function emitsMachineReadablePayload(args: readonly string[]): boolean {
  const path = commandPath(args);
  if (args[0] === "delivery") {
    return !DELIVERY_HUMAN_DEFAULT.some((human) => path === human || path.startsWith(`${human} `));
  }
  if (args[0] === "integrate") return args[1] === "checkpoint" || args[1] === "merge";
  if (args[0] === "base") return args[1] === "merge";
  if (args[0] !== "review") return false;
  return args[1] === "pre-publication"
    || args[1] === "status"
    || (args[1] === "merge-method" && args[2] === "resolve")
    || (args[1] === "checks" && args[2] === "await")
    || (args[1] === "change-request" && args[2] === "resolve");
}

/**
 * Determine whether the built CLI helper allocates a pseudo-terminal.
 * @param args - Exact invocation argv, including leading global flags
 * @param platform - Host platform used by the subprocess helper
 * @returns Whether this invocation receives a real pseudo-TTY
 */
export function usesPseudoTty(args: readonly string[], platform: NodeJS.Platform = process.platform): boolean {
  return platform === "linux" && !args.includes("--json") && !emitsMachineReadablePayload(args);
}
