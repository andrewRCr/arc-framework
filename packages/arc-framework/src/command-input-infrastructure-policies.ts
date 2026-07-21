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

/**
 * Shared-source policies that cannot live in a single command adapter because
 * the implementation is reused across the sync subprocess boundary.
 */
export const infrastructureCommandInputPolicyDeclarations = [{
  commandPath: "sync",
  aliases: [],
  sites: [
    ...([1, 2] as const).map((occurrence) => declareInteractionSite(
      { file: "lib/git/process-executor.ts", kind: "subprocess", callee: "execa", occurrence },
      terminalSubprocessPolicy,
    )),
    declareInteractionSite(
      { file: "lib/git/push-worktree.ts", kind: "subprocess", callee: "execa", occurrence: 1 },
      terminalSubprocessPolicy,
    ),
    ...([1, 2, 3] as const).map((occurrence) => declareInteractionSite(
      { file: "lib/io-context.ts", kind: "subprocess", callee: "execa", occurrence },
      terminalSubprocessPolicy,
    )),
  ],
}] satisfies readonly CommandInputDeclaration[];
