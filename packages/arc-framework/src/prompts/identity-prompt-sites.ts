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

/** Confirm that an identity with personal records belongs to this person. */
export const initIdentityInUsePromptSite = declarePromptSite("prompt.init.identity-in-use", "confirm",
  { file: "prompts/identity-prompt-sites.ts", symbol: "initIdentityInUsePromptSite" }, {
    acquisition: "safe-default", schemaOwnership: "none", defaultSource: "proceed",
    cancellation: "stop", automation: { noInput: "use-default", flags: [], acceptedSyntax: [] },
    mutationBoundary: "personal identity setup", subprocess: "none",
  });

/** Confirm that an identity with personal records belongs to this person. */
export const joinIdentityInUsePromptSite = declarePromptSite("prompt.join.identity-in-use", "confirm",
  { file: "prompts/identity-prompt-sites.ts", symbol: "joinIdentityInUsePromptSite" }, {
    acquisition: "safe-default", schemaOwnership: "none", defaultSource: "proceed",
    cancellation: "stop", automation: { noInput: "use-default", flags: [], acceptedSyntax: [] },
    mutationBoundary: "personal identity setup", subprocess: "none",
  });

/** Confirm that an identity with personal records belongs to this person. */
export const userAddIdentityInUsePromptSite = declarePromptSite("prompt.user-add.identity-in-use", "confirm",
  { file: "prompts/identity-prompt-sites.ts", symbol: "userAddIdentityInUsePromptSite" }, {
    acquisition: "safe-default", schemaOwnership: "none", defaultSource: "proceed",
    cancellation: "stop", automation: { noInput: "use-default", flags: [], acceptedSyntax: [] },
    mutationBoundary: "personal identity setup", subprocess: "none",
  });
