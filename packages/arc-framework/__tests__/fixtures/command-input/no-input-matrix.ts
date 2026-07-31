/** Exact command-level coverage matrix for interaction-capable CLI source sites. */

export interface NoInputMatrixCase {
  readonly commandPath: string;
  readonly args: readonly string[];
  readonly fixture?: "bare" | "arc-project";
  readonly setup?: "provisional-stub" | "planned-stub";
  readonly configuration?: "full-protection";
  readonly expected: { readonly exitCode: number; readonly outputIncludes?: string };
  readonly stdin?: string;
  readonly preservesWorktree?: true;
}

/**
 * Each case runs in a fresh piped-stdio repository with CI and `--no-input` set.
 * Repository inventory tests exact-match these command paths to live interaction sites.
 */
export const NO_INPUT_MATRIX = Object.freeze([
  { commandPath: "check commit-msg", args: ["check", "commit-msg", "-", "--json"], stdin: "feat(check): validate stdin\n\nContext: standalone (maintenance)\n", fixture: "arc-project", expected: { exitCode: 0, outputIncludes: "\"verdict\":\"pass\"" } },
  { commandPath: "errand close", args: ["errand", "close", "matrix", "--json"], fixture: "arc-project", configuration: "full-protection", preservesWorktree: true, expected: { exitCode: 0, outputIncludes: '"operation":"errand-close"' } },
  { commandPath: "errand open", args: ["errand", "open", "matrix", "--inbox-title-file", "-"], stdin: "Matrix title\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "Missing USER-INBOX entry 'Matrix title'" } },
  { commandPath: "hook-remedy-roadmap-conflict", args: ["hook-remedy-roadmap-conflict"], fixture: "bare", expected: { exitCode: 0 } },
  { commandPath: "hook-validate-decompose-record", args: ["hook-validate-decompose-record"], fixture: "bare", expected: { exitCode: 0 } },
  { commandPath: "init", args: ["init", "--name", "matrix", "--identity", "matrix"], fixture: "bare", expected: { exitCode: 0, outputIncludes: "Installation complete" } },
  { commandPath: "join", args: ["join", "--identity", "matrix"], fixture: "arc-project", expected: { exitCode: 0, outputIncludes: "Workspace setup complete" } },
  { commandPath: "promote", args: ["promote", "matrix"], setup: "provisional-stub", preservesWorktree: true, expected: { exitCode: 1, outputIncludes: "Missing required input: --class" } },
  { commandPath: "release commit", args: ["release", "commit"], expected: { exitCode: 11, outputIncludes: "interlock-not-authorized" } },
  { commandPath: "release setup install", args: ["release", "setup", "install", "--json"], preservesWorktree: true, expected: { exitCode: 1, outputIncludes: "missing required input" } },
  { commandPath: "release setup uninstall", args: ["release", "setup", "uninstall", "--harness", "matrix", "--json"], preservesWorktree: true, expected: { exitCode: 0, outputIncludes: "\"command\": \"uninstall\"" } },
  { commandPath: "review", args: ["review", "reduce", "-"], stdin: "", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "\"code\":\"invalid-input\"" } },
  { commandPath: "review chunking resolve", args: ["review", "chunking", "resolve", "-"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "\"code\":\"invalid-input\"" } },
  { commandPath: "review frontline run", args: ["review", "frontline", "run", "-"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "\"code\":\"invalid-input\"" } },
  { commandPath: "start", args: ["start", "matrix", "--here"], setup: "planned-stub", preservesWorktree: true, expected: { exitCode: 1, outputIncludes: "cannot start `matrix`" } },
  { commandPath: "status", args: ["status", "--json"], expected: { exitCode: 0, outputIncludes: "\"mode\":\"full\"" } },
  { commandPath: "stub", args: ["stub", "matrix"], preservesWorktree: true, expected: { exitCode: 1, outputIncludes: "Missing required input" } },
  { commandPath: "sync", args: ["sync", "--json"], expected: { exitCode: 1, outputIncludes: "notes-blocked" } },
  { commandPath: "update", args: ["update", "--quiet"], expected: { exitCode: 0, outputIncludes: "Update complete" } },
  { commandPath: "user open", args: ["user", "open", "matrix"], expected: { exitCode: 0, outputIncludes: "User workspace opened" } },
  { commandPath: "user pull", args: ["user", "pull"], preservesWorktree: true, expected: { exitCode: 1, outputIncludes: "Remote unavailable" } },
  { commandPath: "user sync", args: ["user", "sync"], expected: { exitCode: 1, outputIncludes: "No remote configured" } },
  { commandPath: "view", args: ["view"], expected: { exitCode: 1, outputIncludes: "No active work unit" } },
] satisfies readonly NoInputMatrixCase[]);
