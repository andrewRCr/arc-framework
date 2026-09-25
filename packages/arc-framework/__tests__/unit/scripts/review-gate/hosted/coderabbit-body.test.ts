import { describe, expect, it } from "vitest";

import { parseCodeRabbitReviewBody } from
  "../../../../../src/scripts/review-gate/hosted/coderabbit-body.js";
import type { HostedGitHubReview } from
  "../../../../../src/scripts/review-gate/hosted/github.js";

function calloutItem(title: string, fingerprint: string, bodyTitle: string): string {
  return `
> <details>
> <summary><em>🟠 Major</em> · ${title}</summary><blockquote>
>
> \`src/legacy.ts:12\`
> _🩺 Stability & Availability_ | _🟠 Major_
>
> **${bodyTitle}**
>
> <!-- cr-comment:v1:${fingerprint} -->
>
> </blockquote></details>`;
}

describe("CodeRabbit callout labels", () => {
  it("retains duplicate titles with truthful clipping and falls back for a titleless summary", () => {
    const duplicateTitle = `Preserve ${"boundary ".repeat(80)}`;
    const duplicateSummary = `${duplicateTitle} · <code>legacy.ts:12</code>`;
    const review: HostedGitHubReview = {
      id: "PRR_1",
      url: "https://github.com/owner/repo/pull/42#pullrequestreview-1",
      actorIdentity: "136622811",
      state: "approved",
      headSha: "a".repeat(40),
      submittedAt: "2026-07-23T12:05:00.000Z",
      body: `**Actionable comments posted: 0**

> [!CAUTION]
> **⚠️ Outside diff range comments (3)**
>${calloutItem(duplicateSummary, "111111111111111111111111", "First body title")}
>${calloutItem(duplicateSummary, "222222222222222222222222", "Second body title")}
>${calloutItem("legacy.ts:12", "333333333333333333333333", "Body title fallback")}`,
    };

    const parsed = parseCodeRabbitReviewBody(review);

    expect(parsed.kind).toBe("parsed");
    if (parsed.kind !== "parsed") throw new Error("expected parsed callout fixture");
    expect(parsed.findings.map((finding) => ({
      sourceLabel: finding.sourceLabel,
      sourceLabelTruncated: finding.sourceLabelTruncated,
    }))).toEqual([
      { sourceLabel: Array.from(duplicateTitle).slice(0, 512).join(""), sourceLabelTruncated: true },
      { sourceLabel: Array.from(duplicateTitle).slice(0, 512).join(""), sourceLabelTruncated: true },
      { sourceLabel: "**Body title fallback**", sourceLabelTruncated: undefined },
    ]);
  });
});

describe("CodeRabbit grouped supplemental severity", () => {
  function groupedReview(metadata: string): HostedGitHubReview {
    return {
      id: "PRR_GROUPED",
      url: "https://github.com/owner/repo/pull/42#pullrequestreview-grouped",
      actorIdentity: "136622811",
      state: "approved",
      headSha: "a".repeat(40),
      submittedAt: "2026-07-23T12:05:00.000Z",
      body: `<details>
<summary>🧹 Nitpick comments (1)</summary><blockquote>
<details>
<summary>src/a.ts (1)</summary><blockquote>

\`7\`: ${metadata}

The prose refers to _🟠 Major_ priority, but does not supply provider metadata.

<!-- cr-comment:v1:aaaaaaaaaaaaaaaaaaaaaaaa -->

</blockquote></details>
</blockquote></details>`,
    };
  }

  it("rejects a grade supplied only by explanatory prose", () => {
    expect(parseCodeRabbitReviewBody(groupedReview("_📐 Maintainability & Code Quality_"))).toMatchObject({
      kind: "malformed",
      reason: expect.stringContaining("provider-body-finding-severity-unrecognized"),
    });
  });

  it("retains the grade from the matched metadata line", () => {
    const parsed = parseCodeRabbitReviewBody(groupedReview(
      "_📐 Maintainability & Code Quality_ | _🔵 Trivial_",
    ));
    expect(parsed).toMatchObject({
      kind: "parsed",
      findings: [{ severity: "minor", nit: true, locus: "src/a.ts:7" }],
    });
  });
});
