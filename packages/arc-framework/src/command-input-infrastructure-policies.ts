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

const rawGitCommandPaths = [
  "abandon",
  "activate",
  "archive",
  "deactivate",
  "decompose",
  "delivery compose",
  "delivery entry inspect",
  "delivery plan abandon",
  "delivery plan from-branch",
  "delivery plan from-tasks",
  "delivery eligibility prepare",
  "delivery eligibility close",
  "delivery materialize",
  "delivery native link",
  "delivery native land-prepare",
  "delivery native land-select",
  "delivery native land-status",
  "delivery native land-submit",
  "delivery native observe",
  "delivery native unlink",
  "delivery publish",
  "delivery position",
  "delivery land prepare",
  "delivery land apply",
  "delivery reconcile",
  "delivery rewrite",
  "delivery teardown",
  "demote",
  "finalize",
  "integrate",
  "materialize",
  "park",
  "promote",
  "rename",
  "reopen",
  "repoint-design",
  "resume",
  "review chunking resolve",
  "review planning-lane",
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
  sites: [declareInteractionSite(
    { file: "lib/git/process-executor.ts", kind: "subprocess", callee: "execa", occurrence: 2 },
    rawGitSubprocessPolicy,
  )],
}))] satisfies readonly CommandInputDeclaration[];
