/** Shared store, authoring, and terminal-cleanup boundaries for decomposition modes. */
import type { EntryListConfig } from "../store/concurrency/entries.js";
import type { GitExec } from "../git/exec.js";
import type { Store } from "../store/contract.js";
import type { AbandonContext } from "../work-unit/verbs/abandon.js";

/** One store and Git authority shared by every mode and its lifecycle cleanup. */
export interface DecomposeContext {
  executor: Omit<AbandonContext["executor"], "store" | "exec"> & { store: Store; exec: GitExec };
  identity: string;
  cohortTemplate: string;
  inboundGrammar?: EntryListConfig;
  removal?: AbandonContext["removal"];
  storeTeardown?: AbandonContext["storeTeardown"];
  baseBranch: string;
}

/** JSON read once by the handler, with its operand retained for executable continuations. */
export interface DecomposeMapInput {
  cutMap: unknown;
  cutMapPath: string;
}
