/** Store opening and backend-specific subject admission for Errand exits. */
import { z } from "zod";
import type { UserIOContext } from "../commands/user.js";
import type { GitExecInput } from "../lib/git/index.js";
import { SlugSchema } from "../lib/kernel/index.js";
import type { Store } from "../lib/store/contract.js";
import type { StoreRecord } from "../lib/store/read.js";
import { resolveSubjectOperand } from "../lib/store/subject-operand.js";
import { createErrandTerminalResult, type ErrandTerminalResult } from "../lib/errand/terminal-result.js";
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

/** Select off-branch UID subjects before either protection arm, preserving legacy slug admission. */
export async function selectErrandTerminalSubject(store: Store, operand: string,
  operation: "errand-close" | "errand-abandon"): Promise<
    { kind: "ready"; slug: string; selectedRecord?: StoreRecord }
    | { kind: "stop"; result: ErrandTerminalResult }> {
  if (!store.capabilities.stateOffBranch) return { kind: "ready", slug: operand };
  const common = { operation, subject: null, checkoutPath: null, generation: null };
  try {
    const selected = await resolveSubjectOperand(store, { operand, primaryKinds: ["work-item/meta", "work-item/record"],
      typeRule: "errand", resolveSlug: false });
    if (selected.status === "selected") return { kind: "ready", slug: selected.primary.reference.owner.name, selectedRecord: selected.primary };
    if (selected.status === "slug") return { kind: "ready", slug: selected.slug };
    const refusal = selected.status === "refused" ? selected.refusal : selected;
    const reason = selected.status === "refused" && selected.refusal.code === "not-found" ? "not-found" : "identity-conflict";
    return { kind: "stop", result: createErrandTerminalResult({ ...common, outcome: "refused", reason,
      recommendedPromptText: `${refusal.condition} ${refusal.remedy.text}` }) };
  } catch (error) {
    return { kind: "stop", result: createErrandTerminalResult({ ...common, outcome: "error",
      error: { code: `locus.${operation}.identity-read`, message: error instanceof Error ? error.message : String(error) },
      recommendedPromptText: "Restore readable Errand identity evidence, then retry the same operand." }) };
  }
}
