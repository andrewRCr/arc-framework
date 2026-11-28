/** Explicit remote designation after a sync's store pull. */
import { declarePromptSite } from "../lib/command-input/declaration.js";

/** Ask only on an interactive invocation; an unavailable prompt reports the remedy and publishes no state. */
export const syncStoreDesignationSite = declarePromptSite("prompt.sync.store-designation", "select",
  { file: "prompts/sync-store-designation.ts", symbol: "syncStoreDesignationSite" }, {
    acquisition: "handler-required", schemaOwnership: "none", cancellation: "stop",
    automation: { noInput: "require-explicit", flags: [], acceptedSyntax: ["arc store remote <remote> <choice>"] },
    mutationBoundary: "store remote designation", subprocess: "close-stdin",
  });
