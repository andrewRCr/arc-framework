/** Policies for interaction sites implemented by shared command infrastructure. */

import {
  declareInteractionSite,
  type CommandInputDeclaration,
} from "./lib/command-input/declaration.js";

const terminalSubprocessPolicy = {
  acquisition: "subprocess" as const,
  schemaOwnership: "none" as const,
  cancellation: "not-applicable" as const,
  automation: { noInput: "disable-terminal-input" as const, flags: [], acceptedSyntax: [] },
  mutationBoundary: "sync subprocess boundary",
  subprocess: "terminal-prompts" as const,
};

const rawGitSubprocessPolicy = {
  acquisition: "subprocess" as const,
  schemaOwnership: "none" as const,
  cancellation: "not-applicable" as const,
  automation: { noInput: "same" as const, flags: [], acceptedSyntax: [] },
  mutationBoundary: "byte-preserving repository read",
  subprocess: "close-stdin" as const,
};

const hostedGhSubprocessPolicy = {
  acquisition: "subprocess" as const,
  schemaOwnership: "none" as const,
  cancellation: "not-applicable" as const,
  automation: { noInput: "same" as const, flags: [], acceptedSyntax: [] },
  mutationBoundary: "delivery GitHub subprocess boundary",
  subprocess: "close-stdin" as const,
};

const nativeDeliveryCommandPaths: ReadonlySet<string> = new Set([
  "delivery native link",
  "delivery native land-prepare",
  "delivery native land-select",
  "delivery native land-status",
  "delivery native land-submit",
  "delivery native observe",
  "delivery native unlink",
]);

const hostedGitHubCommandPaths: ReadonlySet<string> = new Set([
  ...nativeDeliveryCommandPaths,
  "delivery refresh execute",
  "delivery top-remedy",
  "integrate checkpoint",
  "integrate merge",
  "review pre-publication",
  "review status",
]);

const rawGitCommandPaths = [
  "abandon",
  "activate",
  "archive",
  "attest",
  "base merge",
  "candidate applicability resolve",
  "deactivate",
  "decompose",
  "delivery compose",
  "delivery eligibility close",
  "delivery eligibility prepare",
  "delivery entry inspect",
  "delivery land apply",
  "delivery land prepare",
  "delivery native link",
  "delivery native land-prepare",
  "delivery native land-select",
  "delivery native land-status",
  "delivery native land-submit",
  "delivery native observe",
  "delivery native unlink",
  "delivery plan abandon",
  "delivery plan from-branch",
  "delivery plan from-tasks",
  "delivery position",
  "delivery publish",
  "delivery reconcile",
  "delivery refresh execute",
  "delivery rematerialize",
  "delivery rewrite",
  "delivery teardown",
  "delivery top-remedy",
  "demote",
  "finalize",
  "integrate checkpoint",
  "integrate merge",
  "publish",
  "materialize",
  "park",
  "promote",
  "rename",
  "reopen",
  "repoint-design",
  "resume",
  "review chunking resolve",
  "review change-request resolve",
  "review planning-lane",
  "review pre-publication",
  "review status",
  "set-stage",
  "start",
  "status",
  "stub",
  "teardown",
  "user reconcile-references",
  "wu reconcile",
] as const;

/**
 * Shared-source policies that cannot live in a single command adapter because
 * the process executors are reused across several command boundaries.
 */
export const infrastructureCommandInputPolicyDeclarations = [{
  commandPath: "sync",
  aliases: [],
  sites: [
    ...([1, 3] as const).map((occurrence) => declareInteractionSite(
      { file: "lib/git/process-executor.ts", kind: "subprocess", callee: "execa", occurrence },
      terminalSubprocessPolicy,
    )),
    declareInteractionSite(
      { file: "lib/git/push-worktree.ts", kind: "subprocess", callee: "execa", occurrence: 1 },
      terminalSubprocessPolicy,
    ),
    declareInteractionSite(
      { file: "lib/io-context.ts", kind: "subprocess", callee: "execa", occurrence: 1 },
      terminalSubprocessPolicy,
    ),
  ],
}, ...rawGitCommandPaths.map((commandPath) => ({
  commandPath,
  aliases: [],
  sites: [
    declareInteractionSite(
      { file: "lib/git/process-executor.ts", kind: "subprocess", callee: "execa", occurrence: 2 },
      rawGitSubprocessPolicy,
    ),
    ...(hostedGitHubCommandPaths.has(commandPath) ? [declareInteractionSite(
      { file: "scripts/review-gate/hosted/gh-process.ts", kind: "subprocess", callee: "execa", occurrence: 1 },
      hostedGhSubprocessPolicy,
    )] : []),
  ],
}))] satisfies readonly CommandInputDeclaration[];
