import { describe, expect, it } from "vitest";

import {
  bindReviewMethodActivity,
  resolveReviewMethodActivity,
  type ReviewMethodFilePort,
  type ReviewMethodActivityPort,
} from "../../../../../src/scripts/review-gate/policy/activity.js";
import { reduceReviewRouting } from "../../../../../src/scripts/review-gate/policy/routing.js";
import type { ReviewRoutingFacts } from "../../../../../src/scripts/review-gate/policy/routing-schema.js";

const facts: ReviewRoutingFacts = {
  schemaVersion: 1,
  changeSetState: "known",
  contentKind: "code-bearing",
  reviewRisk: "routine",
  changeDeterminacy: "ordinary",
  ownership: "self",
  surfaceAuthority: "ordinary",
  assurance: { workContext: "work-unit", workClass: "Light" },
  activity: { selfReview: true, frontlineReview: true },
};

const port = (value: unknown): ReviewMethodActivityPort => ({
  readReviewMethodActivity: () => value,
});

const method = (name: string, active: unknown, extra: string[] = []): string => [
  "---",
  `name: ${name}`,
  "description: Review method",
  `active: ${String(active)}`,
  "override-active: false",
  ...extra,
  "---",
  "",
].join("\n");

const files = (values: Record<string, unknown>): ReviewMethodFilePort => ({
  readMethodFile: (name) => values[name],
});

describe("review method activity port", () => {
  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])("supplies closed activity facts for %s / %s", (selfReview, frontlineReview) => {
    expect(resolveReviewMethodActivity(port({ selfReview, frontlineReview }))).toEqual({
      activity: { selfReview, frontlineReview },
      diagnostics: [],
    });
  });

  it("preserves a valid peer while defaulting malformed activity conservatively", () => {
    expect(resolveReviewMethodActivity(port({ selfReview: false, frontlineReview: "enabled" }))).toEqual({
      activity: { selfReview: false, frontlineReview: true },
      diagnostics: ["activity.frontlineReview"],
    });
    expect(resolveReviewMethodActivity(port({ selfReview: false, extra: true }))).toEqual({
      activity: { selfReview: false, frontlineReview: true },
      diagnostics: ["activity.extra", "activity.frontlineReview"],
    });
  });

  it("keeps each activity adjustment isolated from standard review", () => {
    const baseline = reduceReviewRouting(facts);
    const selfInactive = reduceReviewRouting({
      ...facts,
      activity: resolveReviewMethodActivity(port({ selfReview: false, frontlineReview: true })).activity,
    });
    const frontlineInactive = reduceReviewRouting({
      ...facts,
      activity: resolveReviewMethodActivity(port({ selfReview: true, frontlineReview: false })).activity,
    });

    expect(selfInactive).toMatchObject({
      authorSelfReview: "exempt",
      frontlineAction: baseline.frontlineAction,
      standardReview: baseline.standardReview,
    });
    expect(frontlineInactive).toMatchObject({
      authorSelfReview: baseline.authorSelfReview,
      frontlineAction: "skip",
      standardReview: baseline.standardReview,
    });
  });

  it("binds package defaults and project activation through the injected activity port", () => {
    const defaults = bindReviewMethodActivity(files({}));
    expect(resolveReviewMethodActivity(defaults.activityPort).activity).toEqual({
      selfReview: true,
      frontlineReview: false,
    });
    expect(defaults.activations.selfReview.source).toBe("package-default");
    expect(defaults.activations.frontlineReview.source).toBe("package-default");

    const project = bindReviewMethodActivity(files({
      "self-review": method("self-review", false),
      "frontline-review": method("frontline-review", true),
    }));
    expect(resolveReviewMethodActivity(project.activityPort)).toEqual({
      activity: { selfReview: false, frontlineReview: true },
      diagnostics: [],
    });
    expect(project.activations.selfReview.source).toBe("project");
    expect(project.activations.frontlineReview.source).toBe("project");
  });

  it("falls back per method for missing or malformed project activation", () => {
    const bound = bindReviewMethodActivity(files({
      "self-review": "not frontmatter",
      "frontline-review": method("frontline-review", "enabled"),
    }));
    expect(resolveReviewMethodActivity(bound.activityPort).activity).toEqual({
      selfReview: true,
      frontlineReview: false,
    });
    expect(bound.diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining("self-review"),
      expect.stringContaining("frontline-review"),
    ]));
  });

  it("keeps activation independent of override population and mode", () => {
    const bound = bindReviewMethodActivity(files({
      "self-review": method("self-review", false, ["override-active: true", "override-mode: extend"])
        .replace("override-active: false\n", ""),
      "frontline-review": method("frontline-review", true),
    }));
    expect(resolveReviewMethodActivity(bound.activityPort).activity).toEqual({
      selfReview: false,
      frontlineReview: true,
    });
  });

  it("ignores inherited activity fields and diagnoses the absent facts", () => {
    const inherited: unknown = Object.create({ selfReview: false, frontlineReview: false });

    const resolution = resolveReviewMethodActivity(port(inherited));

    expect(resolution.activity).toEqual({ selfReview: true, frontlineReview: true });
    expect(resolution.diagnostics).toEqual([
      "activity",
      "activity.frontlineReview",
      "activity.selfReview",
    ]);
  });
});
