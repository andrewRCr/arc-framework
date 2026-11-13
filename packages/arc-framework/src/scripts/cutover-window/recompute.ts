/** Re-read a completed window before the flip changes its recorded branch. */
import type { WindowRequest } from "./main.js";
import type { WindowResult, WindowFinding } from "./result.js";
import { readWindowHold, type WindowHoldIO, type WindowRecord } from "./hold.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { readWindowCheckouts } from "./checkouts.js";
import { createWindowImportContext } from "./import-context.js";
import { readWindowPersonalState, readWindowReviewDigest } from "./digests.js";
import { createWindowHost } from "./native-host.js";
import { listWindowRefs } from "./git.js";
import type { WindowHostPort } from "./host.js";
import { windowRecomputeCoordinateFindings, type WindowRecomputeCoordinates } from "./recompute-coordinates.js";
import { readWindowCheckoutStatusFindings, readWindowIgnoredStateFindings, windowPersonalLinkFindings } from "./checkout-cleanliness.js";
import { windowRemainingIdentityFindings } from "./identity-inputs.js";
import { compareWindowLandedConsumption } from "./consumed.js";
import { readWindowStashFindings } from "./stashes.js";
import { parseArgs } from "node:util";

/** Inspect the held import basis without changing any repository ref. */
export async function recomputeWindow(request: WindowRequest): Promise<WindowResult> {
  parseArgs({ args: [...request.args], options: { repo: { type: "string" }, json: { type: "boolean" } } });
  const ports = createDefaultStorePorts({ checkoutRoot: request.repo });
  const io = { repo: request.repo, exec: ports.exec, execInput: ports.execInput };
  const { record } = await readWindowHold(io);
  const { findings } = await compareWindowRecompute(io, record);
  return { operation: "recompute", status: findings.length ? "refused" : "passed", findings };
}

/** One host observation and the optional flip-head exemption supplied by the final pre-merge read. */
export interface WindowRecomputeOptions { host?: Pick<WindowHostPort, "refs">; exemptFlip?: boolean }
/** Fresh coordinates retained for callers that additionally validate the flip's deletion commit. */
export interface WindowRecomputeComparison { observed: WindowRecomputeCoordinates; findings: WindowFinding[] }

/** Compare all pre-merge input coordinates and cleanliness without fetching or writing refs. */
export async function compareWindowRecompute(io: WindowHoldIO, record: WindowRecord,
  options: WindowRecomputeOptions = {}): Promise<WindowRecomputeComparison> {
  const [checkouts, context] = await Promise.all([readWindowCheckouts(io), createWindowImportContext(io.repo)]);
  const [personal, reviewGateDigest] = await Promise.all([
    readWindowPersonalState(context, checkouts), readWindowReviewDigest(context),
  ]);
  const worktrees = checkouts.map(({ path, head, branch }) => {
    const personalDigest = personal.digests[path];
    if (personalDigest === undefined) throw new Error(`No acquired personal digest for ${path}`);
    return { path, head, branch, personalDigest };
  });
  const cleanliness = [...await readWindowCheckoutStatusFindings(io, checkouts), ...await readWindowIgnoredStateFindings(io, checkouts),
    ...await readWindowStashFindings(io), ...windowPersonalLinkFindings(checkouts, personal.disk.links)];
  const refs = await listWindowRefs(io, ["refs/heads/", "refs/remotes/origin/", "refs/arc/user/"]);
  const hostRefs = await (options.host ?? createWindowHost(io)).refs(["refs/heads/*", "refs/arc/user/*/errands"]);
  const select = (prefix: string) => Object.fromEntries([...refs].filter(([ref]) => ref.startsWith(prefix) && ref !== "refs/remotes/origin/HEAD")
    .map(([ref, tip]) => [ref.slice(prefix.length), tip]));
  const branches = { local: select("refs/heads/"), origin: select("refs/remotes/origin/"),
    host: Object.fromEntries(Object.entries(hostRefs).filter(([ref]) => ref.startsWith("refs/heads/")).map(([ref, tip]) => [ref.slice("refs/heads/".length), tip])) };
  const observed = { worktrees, reviewGateDigest, branches };
  const consumed = await compareWindowLandedConsumption(io, record.refs.local);
  const findings = [...windowRecomputeCoordinateFindings(record, observed, options.exemptFlip), ...consumed.findings,
    ...windowRemainingIdentityFindings(Object.fromEntries(refs), "local"), ...windowRemainingIdentityFindings(hostRefs, "origin"),
    ...cleanliness.map(finding => ({ ...finding, condition: `The recorded checkout and stash inputs were clean; observed: ${finding.condition}`,
      remedy: `Stop the window and use restore. ${finding.remedy}` }))];
  return { observed, findings };
}
