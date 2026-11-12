/** Quiescence admission and restore-point acquisition for an explicitly named importing checkout. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { WindowRequest } from "./main.js";
import { WindowRefusal, type WindowResult } from "./result.js";
import { readWindowPreconditions } from "./preflight.js";
import { parseWindowCheckInput } from "./input.js";
import { parseWindowPullRequests, readWindowHostFacts, type WindowHostPort } from "./host.js";
import { createWindowHost } from "./native-host.js";
import { captureWindowRecord } from "./capture.js";
import { writeWindowHold, discardUnfinishedWindowHold, type WindowHoldStepHook } from "./hold.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";

/** External host boundary and named write checkpoints, replaceable in native scenarios. */
export interface WindowCheckOptions { host?: WindowHostPort; step?: WindowHoldStepHook }

async function suppliedListing(path: string, flip: number) {
  try { return parseWindowPullRequests(JSON.parse(await readFile(path, "utf8")), flip); }
  catch (error) {
    if (error instanceof WindowRefusal) throw error;
    throw new WindowRefusal([{ subject: path, condition: error instanceof Error ? error.message : String(error),
      remedy: "Supply a readable complete pull-request listing, then retry check." }]);
  }
}

/** Refuse pre-existing state before acquiring the record and its completion marker. */
export async function checkWindow(request: WindowRequest, options: WindowCheckOptions = {}): Promise<WindowResult> {
  const input = parseWindowCheckInput(request.args);
  const findings = await readWindowPreconditions(request.repo);
  if (findings.length > 0) return { operation: "check", status: "refused", findings };
  const ports = createDefaultStorePorts({ checkoutRoot: request.repo });
  const io = { repo: request.repo, exec: ports.exec, execInput: ports.execInput };
  const host = options.host ?? createWindowHost(io);
  const facts = await readWindowHostFacts({ exec: io.exec, host }, input.pullRequest, {
    ...input.anchor !== undefined ? { anchor: input.anchor } : {},
    ...input.listing !== undefined ? { pullRequests: () => suppliedListing(resolve(request.repo, input.listing ?? ""), input.pullRequest) } : {},
  });
  if (facts.pullRequests.flip.headBranch !== input.branch || facts.pullRequests.flip.baseBranch !== "main") {
    throw new WindowRefusal([{ subject: "flip pull request",
      condition: `Pull request #${input.pullRequest} names ${facts.pullRequests.flip.headBranch} into ${facts.pullRequests.flip.baseBranch}, not ${input.branch} into main.`,
      remedy: "Name the matching flip branch and main-targeting pull request, or repair the request target, then retry." }]);
  }
  const origin = await host.refs(["refs/arc/*"]);
  const record = await captureWindowRecord(io, input, origin);
  try {
    const tip = await writeWindowHold(io, record, options.step);
    return { operation: "check", status: "passed", findings: [], data: { tip } };
  } catch (error) {
    if (error instanceof WindowRefusal) await discardUnfinishedWindowHold(io);
    throw error;
  }
}
