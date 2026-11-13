/** Arguments identifying the flip and optional rehearsal-only facts. */
import { parseArgs } from "node:util";
import { WindowRefusal } from "./result.js";
/** Validated flip inputs, apart from the common explicit checkout and output mode. */
export interface WindowFlipInput { branch: string; pullRequest: number; listing?: string; anchor?: string }

function refuseOptions(condition: string, operation: string): never {
  throw new WindowRefusal([{ subject: `${operation} options`, condition,
    remedy: "Supply --flip-branch and a positive --flip-pr, with valid option values, then retry." }]);
}

/** Parse flip-identifying options without reading any repository or supplied file. */
export function parseWindowFlipInput(args: readonly string[], operation: "check" | "restore" = "check"): WindowFlipInput {
  try {
    const { values } = parseArgs({ args: [...args], options: {
      repo: { type: "string" }, json: { type: "boolean" }, "flip-branch": { type: "string" },
      "flip-pr": { type: "string" }, "pull-requests": { type: "string" }, anchor: { type: "string" },
    } });
    if (operation !== "check" && values.anchor !== undefined) refuseOptions("Only check accepts a supplied anchor.", operation);
    const branch = values["flip-branch"]; const pullRequest = Number(values["flip-pr"]);
    if (!branch || !Number.isSafeInteger(pullRequest) || pullRequest <= 0) refuseOptions("The flip's branch and positive pull-request number are required.", operation);
    return { branch, pullRequest, ...values["pull-requests"] !== undefined ? { listing: values["pull-requests"] } : {},
      ...values.anchor !== undefined ? { anchor: values.anchor } : {} };
  } catch (error) {
    if (error instanceof WindowRefusal) throw error;
    return refuseOptions(error instanceof Error ? error.message : String(error), operation);
  }
}
