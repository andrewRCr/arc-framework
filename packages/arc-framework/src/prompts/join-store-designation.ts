/** Explicit remote designation after a store pull. */
import { declarePromptSite } from "../lib/command-input/declaration.js";

/** Ask only on an interactive invocation; an unavailable prompt preserves the remedy. */
export const joinStoreDesignationSite = declarePromptSite("prompt.join.store-designation", "select",
  { file: "prompts/join-store-designation.ts", symbol: "joinStoreDesignationSite" }, {
    acquisition: "handler-required", schemaOwnership: "none", cancellation: "stop",
    automation: { noInput: "require-explicit", flags: [], acceptedSyntax: ["arc store remote <remote> <choice>"] },
    mutationBoundary: "store remote designation", subprocess: "close-stdin",
  });
