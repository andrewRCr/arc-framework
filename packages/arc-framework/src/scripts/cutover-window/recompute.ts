/** Re-read a completed window before the flip changes its recorded branch. */
import type { WindowRequest } from "./main.js";
import { windowRead, type WindowRead, type WindowResult, type WindowFinding } from "./result.js";
import { readWindowHold, type WindowHoldIO, type WindowRecord } from "./hold.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { readWindowCheckouts } from "./checkouts.js";
import { createWindowImportContext } from "./import-context.js";
import { readWindowPersonalState, readWindowReviewDigest } from "./digests.js";
import { createWindowHost } from "./native-host.js";
import { listWindowRefs, selectWindowRefs } from "./git.js";
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

/**
 * Compare all pre-merge input coordinates and cleanliness without fetching or writing refs. An input that cannot be read
 * reports its own findings and skips only the comparisons it feeds.
 */
export async function compareWindowRecompute(io: WindowHoldIO, record: WindowRecord,
  options: WindowRecomputeOptions = {}): Promise<WindowRecomputeComparison> {
  const [checkouts, context] = await Promise.all([readWindowCheckouts(io), createWindowImportContext(io.repo)]);
  const [personal, digest] = await Promise.all([
    readWindowPersonalState(context, checkouts), windowRead(() => readWindowReviewDigest(context)),
  ]);
  const worktrees = checkouts.map(({ path, head, branch }) => {
    const personalDigest = personal.digests[path];
    if (personalDigest === undefined) throw new Error(`No acquired personal digest for ${path}`);
    return { path, head, branch, personalDigest };
  });
  const cleanliness = [...await readWindowCheckoutStatusFindings(io, checkouts), ...await readWindowIgnoredStateFindings(io, checkouts),
    ...await readWindowStashFindings(io), ...windowPersonalLinkFindings(checkouts, personal.disk.links)];
  const refs = await listWindowRefs(io, ["refs/heads/", "refs/remotes/origin/", "refs/arc/user/"]);
  const host = await windowRead(() => (options.host ?? createWindowHost(io)).refs(["refs/heads/*", "refs/arc/user/*/errands"]));
  const hostRefs = "value" in host ? host.value : null;
  const select = (prefix: string) => selectWindowRefs(refs, prefix, true);
  const branches = { local: select("refs/heads/"), origin: select("refs/remotes/origin/"),
    host: hostRefs === null ? null : selectWindowRefs(new Map(Object.entries(hostRefs)), "refs/heads/", true) };
  const observed = { worktrees, reviewGateDigest: "value" in digest ? digest.value : null, branches };
  const consumed = await windowRead(() => compareWindowLandedConsumption(io, record.refs.local));
  const findings = [...unread(digest), ...unread(host), ...windowRecomputeCoordinateFindings(record, observed, options.exemptFlip),
    ...("value" in consumed ? consumed.value.findings : consumed.findings),
    ...windowRemainingIdentityFindings(Object.fromEntries(refs), "local"), ...hostRefs === null ? [] : windowRemainingIdentityFindings(hostRefs, "origin"),
    ...cleanliness.map(finding => ({ ...finding, condition: `The recorded checkout and stash inputs were clean; observed: ${finding.condition}`,
      remedy: `Stop the window and use restore. ${finding.remedy}` }))];
  return { observed, findings };
}

function unread(read: WindowRead<unknown>): WindowFinding[] {
  return "findings" in read ? read.findings : [];
}
