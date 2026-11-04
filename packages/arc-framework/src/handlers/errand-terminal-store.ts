/** Store opening and backend-specific subject admission for Errand exits. */
import { z } from "zod";
import type { UserIOContext } from "../commands/user.js";
import type { GitExecInput } from "../lib/git/index.js";
import { SlugSchema } from "../lib/kernel/index.js";
import type { Store } from "../lib/store/contract.js";
import { openDefaultStore } from "./lifecycle-shared.js";

interface TerminalStoreInput {
  cwd: string;
  subject: string;
  io: Pick<UserIOContext, "exec" | "execInput">;
  refuse: (code: "identity" | "input", message: string) => void;
}

/** Preserve stdin admission before opening, then retain slug operands for an in-repo store. */
export function openErrandTerminalStore(input: TerminalStoreInput): { store: Store; execInput: GitExecInput } | null {
  if (input.io.execInput === undefined) {
    input.refuse("identity", "The stdin Git boundary is unavailable.");
    return null;
  }
  const store = openDefaultStore(input.cwd, input.io.exec);
  if (!store.capabilities.stateOffBranch) {
    const parsed = SlugSchema.safeParse(input.subject);
    if (!parsed.success) {
      input.refuse("input", z.prettifyError(parsed.error));
      return null;
    }
  }
  return { store, execInput: input.io.execInput };
}
