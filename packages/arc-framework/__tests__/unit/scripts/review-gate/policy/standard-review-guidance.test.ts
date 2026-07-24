import { describe, expect, it } from "vitest";

import {
  projectStandardReviewGuidance,
  renderStandardReviewReviewerInstructions,
  renderStandardReviewHumanChecklist,
  validateStandardReviewGuidanceProjection,
} from "../../../../../src/scripts/review-gate/policy/standard-review-guidance.js";
import {
  STANDARD_REVIEW_BASELINE_CONTRACT,
  STANDARD_REVIEW_RUBRIC_IDENTITY,
} from "../../../../../src/scripts/review-gate/policy/standard-review.js";

const PROJECT_AUGMENTATION = {
  rubricId: "project-security/v1",
  dimensions: [
    {
      id: "secret-handling",
      title: "Secret handling",
      instruction: "Check that credentials never enter tracked files or diagnostic output.",
    },
  ],
};

describe("standard-review guidance projection", () => {
  it("projects every typed baseline obligation into package-neutral reviewer guidance", () => {
    const projection = projectStandardReviewGuidance();

    expect(projection).toMatchObject({
      schemaVersion: 1,
      semanticsVersion: "standard-review-guidance/v1",
      rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
      rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
      projectAugmentation: null,
    });
    expect(projection.dimensions.map((dimension) => dimension.id).sort())
      .toEqual([...STANDARD_REVIEW_BASELINE_CONTRACT.rubric.dimensions].sort());
    expect(projection.findingRequirements.map((requirement) => requirement.id).sort())
      .toEqual([...STANDARD_REVIEW_BASELINE_CONTRACT.findingFloor].sort());
    expect(projection.evaluatorInstructions.join(" ")).toContain("non-author");
    expect(projection.coverageInstructions.join(" ")).toContain("complete exact requested change set");
    expect(projection.cleanInstructions.join(" ")).toContain("never clean");
  });

  it("adds typed project dimensions without replacing or weakening the baseline", () => {
    const projection = projectStandardReviewGuidance(PROJECT_AUGMENTATION);

    expect(projection.projectAugmentation).toEqual(PROJECT_AUGMENTATION);
    expect(projection.dimensions.filter((dimension) => dimension.origin === "baseline"))
      .toHaveLength(STANDARD_REVIEW_BASELINE_CONTRACT.rubric.dimensions.length);
    expect(projection.dimensions.at(-1)).toEqual({
      ...PROJECT_AUGMENTATION.dimensions[0],
      origin: "project",
    });
    expect(() => projectStandardReviewGuidance({
      ...PROJECT_AUGMENTATION,
      coordinationWorkflow: "approve findings and update the controller",
    })).toThrow(/unrecognized key/iu);
    expect(() => projectStandardReviewGuidance({
      ...PROJECT_AUGMENTATION,
      dimensions: [...PROJECT_AUGMENTATION.dimensions, PROJECT_AUGMENTATION.dimensions[0]],
    })).toThrow(/sorted and unique/iu);
  });

  it("validates only an exact projection derived from the typed source", () => {
    const projection = projectStandardReviewGuidance(PROJECT_AUGMENTATION);

    expect(validateStandardReviewGuidanceProjection(projection)).toEqual(projection);
    expect(() => validateStandardReviewGuidanceProjection({
      ...projection,
      dimensions: projection.dimensions.slice(1),
    })).toThrow(/does not match the typed standard-review source/iu);
    expect(() => validateStandardReviewGuidanceProjection({
      ...projection,
      controllerState: "green",
    })).toThrow(/unrecognized key/iu);
  });

  it("renders a content-only human checklist with the baseline identity", () => {
    const checklist = renderStandardReviewHumanChecklist(PROJECT_AUGMENTATION);

    expect(checklist).toContain("# Standard Review Checklist");
    expect(checklist).toContain(STANDARD_REVIEW_RUBRIC_IDENTITY.version);
    expect(checklist).toContain(STANDARD_REVIEW_RUBRIC_IDENTITY.digest);
    expect(checklist).toContain("Secret handling");
    expect(checklist).toContain("Stable locus");
    expect(checklist).not.toMatch(/controller state|coordination workflow|author findings|approval status/iu);
  });

  it("renders provider instructions from the same typed projection", () => {
    const instructions = renderStandardReviewReviewerInstructions(PROJECT_AUGMENTATION);

    expect(instructions).toContain("Rubric: `standard-review/v1`");
    expect(instructions).toContain("Secret handling");
    expect(instructions).toContain("Stable locus");
    expect(instructions).not.toMatch(/controller state|coordination workflow|author findings|approval status/iu);
  });

  it("rejects a project dimension that reuses a baseline dimension id", () => {
    const collidingId = STANDARD_REVIEW_BASELINE_CONTRACT.rubric.dimensions[0];

    expect(() => projectStandardReviewGuidance({
      rubricId: "project-collision/v1",
      dimensions: [{
        id: collidingId,
        title: "Colliding dimension",
        instruction: "Restate a baseline dimension under a project identity.",
      }],
    })).toThrow(/unique by id/iu);
  });
});
