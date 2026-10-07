/** Caller-owned identity questions for fresh installation and workspace setup. */
import { declarePromptSite } from "../lib/command-input/declaration.js";

/** Installation identity acquisition with the Git user-name suggestion as its default. */
export const initIdentityPromptSite = declarePromptSite("prompt.init.identity", "text",
  { file: "prompts/identity-prompt-sites.ts", symbol: "initIdentityPromptSite" }, {
    acquisition: "safe-default", schemaOwnership: "owned", schemaField: "identity",
    defaultSource: "slug of git config user.name", cancellation: "stop",
    automation: { noInput: "use-default", flags: ["--identity"], acceptedSyntax: ["--identity <name>"] },
    mutationBoundary: "installation identity resolution", subprocess: "none",
  });

/** Workspace identity acquisition with the Git user-name suggestion as its default. */
export const joinIdentityPromptSite = declarePromptSite("prompt.join.identity", "text",
  { file: "prompts/identity-prompt-sites.ts", symbol: "joinIdentityPromptSite" }, {
    acquisition: "safe-default", schemaOwnership: "owned", schemaField: "identity",
    defaultSource: "slug of git config user.name", cancellation: "stop",
    automation: { noInput: "use-default", flags: ["--identity"], acceptedSyntax: ["--identity <name>"] },
    mutationBoundary: "workspace identity resolution", subprocess: "none",
  });
