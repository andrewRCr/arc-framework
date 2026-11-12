/** Arguments identifying the flip and optional rehearsal-only facts. */
import { parseArgs } from "node:util";
import { WindowRefusal } from "./result.js";
/** Validated check inputs, apart from the common explicit checkout and output mode. */
export interface WindowCheckInput { branch: string; pullRequest: number; listing?: string; anchor?: string }

function refuseOptions(condition: string): never {
  throw new WindowRefusal([{ subject: "check options", condition,
    remedy: "Supply --flip-branch and a positive --flip-pr, with valid option values, then retry." }]);
}

/** Parse check-specific options without reading any repository or supplied file. */
export function parseWindowCheckInput(args: readonly string[]): WindowCheckInput {
  try {
    const { values } = parseArgs({ args: [...args], options: {
      repo: { type: "string" }, json: { type: "boolean" }, "flip-branch": { type: "string" },
      "flip-pr": { type: "string" }, "pull-requests": { type: "string" }, anchor: { type: "string" },
    } });
    const branch = values["flip-branch"]; const pullRequest = Number(values["flip-pr"]);
    if (!branch || !Number.isSafeInteger(pullRequest) || pullRequest <= 0) refuseOptions("The flip's branch and positive pull-request number are required.");
    return { branch, pullRequest, ...values["pull-requests"] !== undefined ? { listing: values["pull-requests"] } : {},
      ...values.anchor !== undefined ? { anchor: values.anchor } : {} };
  } catch (error) {
    if (error instanceof WindowRefusal) throw error;
    return refuseOptions(error instanceof Error ? error.message : String(error));
  }
}
