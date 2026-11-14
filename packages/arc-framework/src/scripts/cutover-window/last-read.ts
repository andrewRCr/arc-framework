/** Final pre-merge observation of the window and its named flip request. */
import type { WindowRequest } from "./main.js";
import { WindowRefusal, windowRead, type WindowFinding, type WindowResult } from "./result.js";
import { parseWindowFlipInput } from "./input.js";
import { readWindowHold } from "./hold.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { createWindowHost } from "./native-host.js";
import { readWindowHostFacts, type WindowHostPort } from "./host.js";
import { readSuppliedWindowRequests } from "./supplied.js";
import { windowFlipCommitBasis, readWindowFlipCommitFindings } from "./flip-commit.js";
import { compareWindowRecompute } from "./recompute.js";

/** Replace the external host boundary while retaining native repository observations. */
export interface WindowLastReadOptions { host?: WindowHostPort }

/** Run the shared comparisons with only the recorded flip's tips and checkout head exempted, reporting unreadable host facts beside them. */
export async function lastReadWindow(request: WindowRequest, options: WindowLastReadOptions = {}): Promise<WindowResult> {
  const input = parseWindowFlipInput(request.args, "last-read");
  const ports = createDefaultStorePorts({ checkoutRoot: request.repo });
  const io = { repo: request.repo, exec: ports.exec, execInput: ports.execInput };
  const { record } = await readWindowHold(io);
  if (input.branch !== record.flip.branch || input.pullRequest !== record.flip.pullRequest) throw new WindowRefusal([{
    subject: "flip identity", condition: `The hold names ${record.flip.branch} and request #${record.flip.pullRequest}, not ${input.branch} and #${input.pullRequest}.`,
    remedy: "Name the branch and request recorded in the hold, then retry last-read.",
  }]);
  const host = options.host ?? createWindowHost(io), listing = input.listing;
  const facts = await windowRead(() => readWindowHostFacts({ exec: io.exec, host }, input.pullRequest,
    listing === undefined ? {} : { pullRequests: () => readSuppliedWindowRequests(request.repo, listing, input.pullRequest) }));
  const flip = "value" in facts ? facts.value.pullRequests.flip : null;
  const findings: WindowFinding[] = "findings" in facts ? facts.findings : [];
  if (flip !== null && (flip.headBranch !== record.flip.branch || flip.baseBranch !== "main")) findings.push({
    subject: "flip pull request", condition: `The request names ${flip.headBranch} into ${flip.baseBranch}, not the recorded flip into main.`,
    remedy: "Repair the request to name the recorded flip into main, then retry last-read.",
  });
  const recomputed = await compareWindowRecompute(io, record, { host, exemptFlip: true });
  findings.push(...recomputed.findings);
  if (flip?.autoMergeArmed) findings.push({ subject: "flip pull request",
    condition: "Auto-merge is armed on the flip request.",
    remedy: "Run gh pr merge --disable-auto for the flip request, then retry last-read or use restore.",
  });
  const basis = windowFlipCommitBasis(record, recomputed.observed);
  findings.push(...basis.findings);
  if (basis.tip !== null && basis.findings.length === 0)
    findings.push(...await readWindowFlipCommitFindings(io, record.flip.head, basis.tip));
  return { operation: "last-read", status: findings.length ? "refused" : "passed", findings };
}
