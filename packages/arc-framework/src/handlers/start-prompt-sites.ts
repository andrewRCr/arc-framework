/** Caller-owned confirmations for planning, graduation and resumption. */
import { declarePromptSite } from "../lib/command-input/declaration.js";

const courtesyPolicy = {
  acquisition: "courtesy-confirmation" as const, schemaOwnership: "none" as const,
  cancellation: "stop" as const,
  automation: { noInput: "proceed" as const, flags: ["--yes"], acceptedSyntax: ["--yes"] },
  mutationBoundary: "start dispatch", subprocess: "none" as const,
};

/** Explicit interactive override of indeterminate lifecycle truth. */
export const indeterminateLifecyclePromptSite = declarePromptSite("safety.indeterminate-lifecycle", "confirm",
  { file: "handlers/start-prompt-sites.ts", symbol: "indeterminateLifecyclePromptSite" }, {
    acquisition: "interactive-only-override", schemaOwnership: "none", cancellation: "stop",
    automation: { noInput: "refuse", flags: [], acceptedSyntax: [] },
    mutationBoundary: "start lifecycle safety gate", subprocess: "none",
  });

/** Confirmation before spawning a new planning worktree. */
export const createNewPromptSite = declarePromptSite("prompt.start.create-new", "confirm",
  { file: "handlers/start-prompt-sites.ts", symbol: "createNewPromptSite" }, courtesyPolicy);
/** Confirmation before graduating in the current checkout. */
export const graduateHerePromptSite = declarePromptSite("prompt.start.graduate-here", "confirm",
  { file: "handlers/start-prompt-sites.ts", symbol: "graduateHerePromptSite" }, courtesyPolicy);
/** Confirmation before graduating into a spawned worktree. */
export const graduateWorktreePromptSite = declarePromptSite("prompt.start.graduate-worktree", "confirm",
  { file: "handlers/start-prompt-sites.ts", symbol: "graduateWorktreePromptSite" }, courtesyPolicy);
/** Confirmation before resuming in the current checkout. */
export const resumeHerePromptSite = declarePromptSite("prompt.start.resume-here", "confirm",
  { file: "handlers/start-prompt-sites.ts", symbol: "resumeHerePromptSite" }, courtesyPolicy);
/** Confirmation before resuming in a fresh worktree. */
export const resumeWorktreePromptSite = declarePromptSite("prompt.start.resume-worktree", "confirm",
  { file: "handlers/start-prompt-sites.ts", symbol: "resumeWorktreePromptSite" }, courtesyPolicy);
/** Confirmation before scaffolding a planning work unit in place. */
export const coldStartPromptSite = declarePromptSite("prompt.start.cold-start", "confirm",
  { file: "handlers/start-prompt-sites.ts", symbol: "coldStartPromptSite" }, courtesyPolicy);
