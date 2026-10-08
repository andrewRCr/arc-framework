import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { finding, parseCodeRabbitReviewBody } from
  "../../../../../src/scripts/review-gate/hosted/coderabbit-body.js";
import type { HostedGitHubReview, HostedGitHubThreadComment } from
  "../../../../../src/scripts/review-gate/hosted/github.js";

const boldBadgeReviewBodyUrl = new URL(
  "../../../../fixtures/coderabbit-hosted/bold-badge-review-body.txt",
  import.meta.url,
);

const badgeEmphasis = [
  ["italic", (label: string) => `_${label}_`],
  ["bold", (label: string) => `**${label}**`],
] as const;

function badgeLine(emphasize: (label: string) => string, ...labels: string[]): string {
  return labels.map(emphasize).join(" | ");
}

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
  it.each(badgeEmphasis.flatMap(([form, emphasize]) => [
    ["Nitpick", "Ordinary wording", form, badgeLine(emphasize, "🩺 Stability & Availability", "🟡 Minor")],
    ["Outside diff range", "[nit] Pure wording", form, badgeLine(emphasize, "🩺 Stability & Availability", "🟡 Minor")],
  ]))("classifies minor %s callouts worded %j as nits with %s badges", (category, wording, _form, metadata) => {
    const review: HostedGitHubReview = {
      id: "PRR_NIT",
      url: "https://github.com/owner/repo/pull/42#pullrequestreview-nit",
      actorIdentity: "136622811",
      state: "approved",
      headSha: "a".repeat(40),
      submittedAt: "2026-07-23T12:05:00.000Z",
      body: `**Actionable comments posted: 0**

> [!CAUTION]
> **⚠️ ${category} comments (1)**
> <details>
> <summary><em>🟡 Minor</em> · Example · <code>legacy.ts:12</code></summary><blockquote>
>
> \`src/legacy.ts:12\`
> ${metadata}
>
> ${wording}
>
> <!-- cr-comment:v1:111111111111111111111111 -->
>
> </blockquote></details>`,
    };
    expect(parseCodeRabbitReviewBody(review)).toMatchObject({
      kind: "parsed",
      findings: [{ severity: "minor", nit: true }],
    });
  });

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

describe("CodeRabbit inline thread labels", () => {
  function threadComment(body: string): HostedGitHubThreadComment {
    return {
      id: "123",
      reviewId: "PRR_1",
      replyToReviewId: null,
      actorIdentity: "136622811",
      body,
      url: "https://github.com/owner/repo/pull/42#discussion_r1",
      path: "src/a.ts",
      line: 7,
      headSha: "a".repeat(40),
    };
  }

  describe.each(badgeEmphasis)("with %s badges", (_form, emphasize) => {
    const badges = badgeLine(emphasize, "🎯 Functional Correctness", "🟡 Minor", "⚡ Quick win");

    it.each([
      [
        "a title after the badge line",
        `${badges}\n\n**Match the file on a path boundary.**\n\nDetails.`,
        "**Match the file on a path boundary.**",
      ],
      [
        "a title after collapsed supporting analysis",
        `${badges}\r\n\r\n<details>\n<summary>🔎 Supported by static analysis</summary>\n\n**Script output**\n\n`
          + "<details>\n<summary>Nested</summary>\nMore.\n</details>\n</details>\n\n**Reject a stale scope replay.**\n",
        "**Reject a stale scope replay.**",
      ],
      [
        "a severity line that carries its own text",
        `${emphasize("🟠 Major")} broken boundary\n\nDetails.`,
        `${emphasize("🟠 Major")} broken boundary`,
      ],
    ])("labels an inline finding from %s", (_shape, body, label) => {
      expect(finding("PRRT_1", threadComment(body))).toMatchObject({ severity: expect.any(String), sourceLabel: label });
    });

    it("carries no label when only badges and collapsed content remain", () => {
      const labelled = finding(
        "PRRT_1",
        threadComment(`${badges}\n\n<details>\n<summary>Only analysis</summary>\n</details>`),
      );

      expect(labelled).toMatchObject({ severity: "minor" });
      expect(labelled).not.toHaveProperty("sourceLabel");
    });
  });
});

describe.each(badgeEmphasis)("CodeRabbit grouped supplemental severity with %s badges", (_form, emphasize) => {
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

The prose refers to ${emphasize("🟠 Major")} priority, but does not supply provider metadata.

<!-- cr-comment:v1:aaaaaaaaaaaaaaaaaaaaaaaa -->

</blockquote></details>
</blockquote></details>`,
    };
  }

  it("rejects a grade supplied only by explanatory prose", () => {
    expect(parseCodeRabbitReviewBody(groupedReview(badgeLine(emphasize, "📐 Maintainability & Code Quality"))))
      .toMatchObject({
        kind: "malformed",
        reason: expect.stringContaining("provider-body-finding-severity-unrecognized"),
      });
  });

  it("retains the grade from the matched metadata line", () => {
    const parsed = parseCodeRabbitReviewBody(groupedReview(
      badgeLine(emphasize, "📐 Maintainability & Code Quality", "🔵 Trivial"),
    ));
    expect(parsed).toMatchObject({
      kind: "parsed",
      findings: [{ severity: "minor", nit: true, locus: "src/a.ts:7" }],
    });
  });
});

describe("CodeRabbit bold-badge review body", () => {
  it("parses the grouped nitpick from a review CodeRabbit posted with bold badges", async () => {
    const review: HostedGitHubReview = {
      id: "PRR_BOLD",
      url: "https://github.com/owner/repo/pull/42#pullrequestreview-bold",
      actorIdentity: "136622811",
      state: "commented",
      headSha: "a".repeat(40),
      submittedAt: "2026-10-06T01:37:08.000Z",
      body: await readFile(boldBadgeReviewBodyUrl, "utf8"),
    };

    const parsed = parseCodeRabbitReviewBody(review);

    expect(parsed).toEqual({
      kind: "parsed",
      actionableCount: null,
      supplementalCounts: { nitpick: 1, "outside-diff": 0 },
      findings: [expect.objectContaining({
        findingId: "PRR_BOLD:5c5d68124d9c257974ca3454",
        fingerprint: "5c5d68124d9c257974ca3454",
        severity: "minor",
        nit: true,
        locus: "packages/arc-framework/src/scripts/review-gate/status-errand.ts:413-418",
        sourceLabel: "**Inject the raw Git executor into the contribution proof.**",
      })],
    });
  });
});
