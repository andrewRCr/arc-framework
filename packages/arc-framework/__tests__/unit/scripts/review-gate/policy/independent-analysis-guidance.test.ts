import { describe, expect, it } from "vitest";

import {
  projectIndependentAnalysisGuidance,
  renderIndependentAnalysisReviewerInstructions,
  renderIndependentAnalysisHumanChecklist,
  validateIndependentAnalysisGuidanceProjection,
} from "../../../../../src/scripts/review-gate/policy/independent-analysis-guidance.js";
import {
  INDEPENDENT_ANALYSIS_BASELINE_CONTRACT,
  INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY,
} from "../../../../../src/scripts/review-gate/policy/independent-analysis.js";

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

describe("independent-analysis guidance projection", () => {
  it("projects every typed baseline obligation into package-neutral reviewer guidance", () => {
    const projection = projectIndependentAnalysisGuidance();

    expect(projection).toMatchObject({
      schemaVersion: 1,
      semanticsVersion: "independent-analysis-guidance/v1",
      rubricVersion: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.version,
      rubricDigest: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.digest,
      projectAugmentation: null,
    });
    expect(projection.dimensions.map((dimension) => dimension.id).sort())
      .toEqual([...INDEPENDENT_ANALYSIS_BASELINE_CONTRACT.rubric.dimensions].sort());
    expect(projection.findingRequirements.map((requirement) => requirement.id).sort())
      .toEqual([...INDEPENDENT_ANALYSIS_BASELINE_CONTRACT.findingFloor].sort());
    expect(projection.evaluatorInstructions.join(" ")).toContain("non-author");
    expect(projection.coverageInstructions.join(" ")).toContain("complete exact requested change set");
    expect(projection.cleanInstructions.join(" ")).toContain("never clean");
  });

  it("adds typed project dimensions without replacing or weakening the baseline", () => {
    const projection = projectIndependentAnalysisGuidance(PROJECT_AUGMENTATION);

    expect(projection.projectAugmentation).toEqual(PROJECT_AUGMENTATION);
    expect(projection.dimensions.filter((dimension) => dimension.origin === "baseline"))
      .toHaveLength(INDEPENDENT_ANALYSIS_BASELINE_CONTRACT.rubric.dimensions.length);
    expect(projection.dimensions.at(-1)).toEqual({
      ...PROJECT_AUGMENTATION.dimensions[0],
      origin: "project",
    });
    expect(() => projectIndependentAnalysisGuidance({
      ...PROJECT_AUGMENTATION,
      coordinationWorkflow: "approve findings and update the controller",
    })).toThrow(/unrecognized key/iu);
    expect(() => projectIndependentAnalysisGuidance({
      ...PROJECT_AUGMENTATION,
      dimensions: [...PROJECT_AUGMENTATION.dimensions, PROJECT_AUGMENTATION.dimensions[0]],
    })).toThrow(/sorted and unique/iu);
  });

  it("validates only an exact projection derived from the typed source", () => {
    const projection = projectIndependentAnalysisGuidance(PROJECT_AUGMENTATION);

    expect(validateIndependentAnalysisGuidanceProjection(projection)).toEqual(projection);
    expect(() => validateIndependentAnalysisGuidanceProjection({
      ...projection,
      dimensions: projection.dimensions.slice(1),
    })).toThrow(/does not match the typed independent-analysis source/iu);
    expect(() => validateIndependentAnalysisGuidanceProjection({
      ...projection,
      controllerState: "green",
    })).toThrow(/unrecognized key/iu);
  });

  it("renders a content-only human checklist with the baseline identity", () => {
    const checklist = renderIndependentAnalysisHumanChecklist(PROJECT_AUGMENTATION);

    expect(checklist).toContain("# Independent Analysis Checklist");
    expect(checklist).toContain(INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.version);
    expect(checklist).toContain(INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.digest);
    expect(checklist).toContain("Secret handling");
    expect(checklist).toContain("Stable locus");
    expect(checklist).not.toMatch(/controller state|coordination workflow|author findings|approval status/iu);
  });

  it("renders provider instructions from the same typed projection", () => {
    const instructions = renderIndependentAnalysisReviewerInstructions(PROJECT_AUGMENTATION);

    expect(instructions).toContain("Rubric: `independent-analysis/v1`");
    expect(instructions).toContain("Secret handling");
    expect(instructions).toContain("Stable locus");
    expect(instructions).not.toMatch(/controller state|coordination workflow|author findings|approval status/iu);
  });
});
