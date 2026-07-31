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
    ...([1, 2, 3, 4] as const).map((occurrence) => declareInteractionSite(
      { file: "lib/io-context.ts", kind: "subprocess", callee: "execa", occurrence },
      terminalSubprocessPolicy,
    )),
  ],
}, {
  commandPath: "errand close",
  aliases: [],
  sites: [declareInteractionSite(
    { file: "lib/locus/process-exec.ts", kind: "subprocess", callee: "execa", occurrence: 1 },
    {
      acquisition: "subprocess",
      schemaOwnership: "none",
      cancellation: "not-applicable",
      automation: { noInput: "same", flags: [], acceptedSyntax: [] },
      mutationBoundary: "errand close locus process-inspection boundary",
      subprocess: "close-stdin",
    },
  )],
}, {
  commandPath: "errand abandon",
  aliases: [],
  sites: [declareInteractionSite(
    { file: "lib/locus/process-exec.ts", kind: "subprocess", callee: "execa", occurrence: 1 },
    {
      acquisition: "subprocess",
      schemaOwnership: "none",
      cancellation: "not-applicable",
      automation: { noInput: "same", flags: [], acceptedSyntax: [] },
      mutationBoundary: "errand abandon locus process-inspection boundary",
      subprocess: "close-stdin",
    },
  )],
}] satisfies readonly CommandInputDeclaration[];
