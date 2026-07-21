/** Exact command-level coverage matrix for interaction-capable CLI source sites. */

export interface NoInputMatrixCase {
  readonly commandPath: string;
  readonly args: readonly string[];
  readonly stdin?: string;
}

/**
 * Each case runs in a fresh piped-stdio repository with CI and `--no-input` set.
 * Repository inventory tests exact-match these command paths to live interaction sites.
 */
export const NO_INPUT_MATRIX = Object.freeze([
  { commandPath: "check commit-msg", args: ["check", "commit-msg", "-", "--json"], stdin: "feat(check): validate stdin\n" },
  { commandPath: "errand open", args: ["errand", "open", "matrix", "--inbox-title-file", "-"], stdin: "Matrix title\n" },
  { commandPath: "hook-remedy-roadmap-conflict", args: ["hook-remedy-roadmap-conflict"] },
  { commandPath: "hook-validate-decompose-record", args: ["hook-validate-decompose-record"] },
  { commandPath: "init", args: ["init", "--name", "matrix", "--identity", "matrix"] },
  { commandPath: "join", args: ["join", "--identity", "matrix"] },
  { commandPath: "promote", args: ["promote", "matrix"] },
  { commandPath: "release commit", args: ["release", "commit"] },
  { commandPath: "release setup install", args: ["release", "setup", "install", "--json"] },
  { commandPath: "release setup uninstall", args: ["release", "setup", "uninstall", "--harness", "matrix", "--json"] },
  { commandPath: "start", args: ["start", "matrix"] },
  { commandPath: "status", args: ["status", "--json"] },
  { commandPath: "stub", args: ["stub", "matrix"] },
  { commandPath: "sync", args: ["sync", "--json"] },
  { commandPath: "update", args: ["update", "--quiet"] },
  { commandPath: "user open", args: ["user", "open", "matrix"] },
  { commandPath: "user pull", args: ["user", "pull"] },
  { commandPath: "user sync", args: ["user", "sync"] },
  { commandPath: "view", args: ["view"] },
] satisfies readonly NoInputMatrixCase[]);
