/** Parse Codex findings delivered as standalone pull-request review bodies. */

import { canonicalDigest } from "../../../lib/kernel/index.js";
import { captureReviewFindingSourceLabel } from "../core/finding-records.js";
import type { HostedFinding } from "./await.js";
import type { HostedGitHubReview } from "./github.js";
import type { HostedTarget } from "./request.js";

const MARKER = "<!-- codex-code-review-finding:v1 -->";
const PRIORITY = /^\*\*<sub><sub>!\[P([0-3]) Badge\]\(https:\/\/img\.shields\.io\/badge\/P\1-[^\s)]+\)<\/sub><\/sub>\s+(.+)\*\*$/u;

type BodyFinding = Omit<Extract<HostedFinding, { origin: "review-body" }>, "sourceOrdinal">;
type BodyResult =
  | { kind: "parsed"; findings: BodyFinding[] }
  | { kind: "malformed" };

function locus(location: string, target: HostedTarget): string | null {
  const unwrapped = /^`([^`]+)`$/u.exec(location)?.[1] ?? location;
  let url: URL;
  try { url = new URL(unwrapped); } catch { return null; }
  const prefix = `/${target.repository}/blob/${target.headSha}/`;
  if (url.origin !== "https://github.com" || !url.pathname.startsWith(prefix)
    || url.search !== "") return null;
  const path = url.pathname.slice(prefix.length);
  const line = /^#L([1-9]\d*)(?:-L([1-9]\d*))?$/u.exec(url.hash);
  const start = Number(line?.[1]);
  const end = line?.[2] === undefined ? start : Number(line[2]);
  if (path.length === 0 || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null;
  return `${path}:${start}${end === start ? "" : `-${end}`}`;
}

/** Read the provider's marked single-finding review without creating synthetic thread settlement. */
export function parseCodexReviewBody(review: HostedGitHubReview, target: HostedTarget): BodyResult {
  if (!review.body.includes(MARKER)) return { kind: "parsed", findings: [] };
  if (review.body.split(MARKER).length !== 2) return { kind: "malformed" };
  const content = review.body.split(/^[\t ]*<details>[\t ]*<summary>/mu, 1)[0]?.trim() ?? "";
  const lines = content.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const [marker, heading, location, title, ...prose] = lines;
  const parsedLocus = location === undefined ? null : locus(location, target);
  const priority = title === undefined ? null : PRIORITY.exec(title);
  const label = priority?.[2]?.trim();
  if (marker !== MARKER || heading !== "### 💡 Codex Review" || parsedLocus === null
    || priority === null || label === undefined || label.length === 0 || prose.length === 0) {
    return { kind: "malformed" };
  }
  const fingerprint = canonicalDigest(content);
  return {
    kind: "parsed",
    findings: [{
      findingId: `${review.id}:${fingerprint}`,
      origin: "review-body",
      reviewId: review.id,
      fingerprint,
      settlement: "not-applicable",
      severity: priority[1] === "0" ? "critical" : priority[1] === "1" ? "major" : "minor",
      locus: parsedLocus,
      url: review.url,
      body: content,
      ...captureReviewFindingSourceLabel({ title: label }),
    }],
  };
}
