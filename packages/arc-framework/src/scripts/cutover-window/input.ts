/** Arguments identifying the flip and optional rehearsal-only facts. */
import { parseArgs } from "node:util";
import { WindowRefusal } from "./result.js";
/** Validated flip inputs, apart from the common explicit checkout and output mode. */
export interface WindowFlipInput { branch: string; pullRequest: number; listing?: string; anchor?: string; path?: string; accept?: string[] }

function refuseOptions(condition: string, operation: string): never {
  throw new WindowRefusal([{ subject: `${operation} options`, condition,
    remedy: "Supply --flip-branch and a positive --flip-pr, with valid option values, then retry." }]);
}

function validateOperationOptions(operation: "check" | "restore", values: Pick<WindowFlipInput, "anchor" | "path" | "accept">): void {
  if (operation !== "restore" && values.accept !== undefined) refuseOptions("Only restore accepts ref-value acceptance operands.", operation);
  if (operation !== "check" && values.anchor !== undefined) refuseOptions("Only check accepts a supplied anchor.", operation);
  if (operation !== "check" && values.path !== undefined) refuseOptions("Only check accepts a command search path.", operation);
}

/** Parse flip-identifying options without reading any repository or supplied file. */
export function parseWindowFlipInput(args: readonly string[], operation: "check" | "restore" = "check"): WindowFlipInput {
  try {
    const { values } = parseArgs({ args: [...args], options: {
      repo: { type: "string" }, json: { type: "boolean" }, "flip-branch": { type: "string" },
      "flip-pr": { type: "string" }, "pull-requests": { type: "string" }, anchor: { type: "string" }, path: { type: "string" }, accept: { type: "string", multiple: true },
    } });
    validateOperationOptions(operation, values);
    const branch = values["flip-branch"]; const pullRequest = Number(values["flip-pr"]);
    if (!branch || !Number.isSafeInteger(pullRequest) || pullRequest <= 0) refuseOptions("The flip's branch and positive pull-request number are required.", operation);
    return { branch, pullRequest, ...values["pull-requests"] !== undefined ? { listing: values["pull-requests"] } : {},
      ...values.anchor !== undefined ? { anchor: values.anchor } : {},
      ...values.path !== undefined ? { path: values.path } : {},
      ...values.accept !== undefined ? { accept: values.accept } : {} };
  } catch (error) {
    if (error instanceof WindowRefusal) throw error;
    return refuseOptions(error instanceof Error ? error.message : String(error), operation);
  }
}
