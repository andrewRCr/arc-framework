/** WU assurance composition over effective method activity and project rubric binding. */

import { parseReviewRubric, type MetaRecord } from "../../../lib/active/meta-reader.js";
import { WorkClassSchema } from "../../../lib/kernel/index.js";
import { SlugSchema } from "../../../lib/kernel/schema/slug.js";
import {
  WorkUnitReviewAssuranceSchema,
  type ReviewRubricOverlayResolution,
  type WorkUnitReviewAssurance,
} from "./assurance-schema.js";
import {
  bindReviewMethodActivity,
  resolveReviewMethodActivity,
  type ReviewMethodActivityPort,
  type ReviewMethodFilePort,
} from "./activity.js";
import {
  type ReviewRubricBindingPort,
  type ReviewRubricBindingResolution,
} from "./rubric-binding.js";
import {
  projectStandardReviewGuidance,
  type StandardReviewGuidanceProjection,
  type StandardReviewProjectAugmentation,
} from "./standard-review-guidance.js";

export type { ReviewRubricBindingPort } from "./rubric-binding.js";

/** Production-composed assurance, guidance, and declaration diagnostics. */
export type ComposedWorkUnitReviewAssurance =
  | {
    readonly status: "resolved";
    readonly assurance: WorkUnitReviewAssurance;
    readonly guidance: StandardReviewGuidanceProjection;
    readonly diagnostics: readonly string[];
  }
  | {
    readonly status: "refused";
    readonly assurance: WorkUnitReviewAssurance;
    readonly diagnostics: readonly string[];
  };

interface ResolvedRubricOverlay {
  readonly reviewRubric: ReviewRubricOverlayResolution;
  readonly augmentation?: StandardReviewProjectAugmentation;
  readonly diagnostics: readonly string[];
}

function unavailableBinding(identity: string): ReviewRubricBindingResolution {
  return {
    status: "unavailable",
    identity,
    reason: "lookup-failed",
    diagnostics: [`rubric.${identity}.lookup-failed`],
  };
}

function resolveRubricOverlay(
  identity: string | null,
  rubricPort: ReviewRubricBindingPort,
): ResolvedRubricOverlay {
  if (identity === null) return { reviewRubric: { state: "absent" }, diagnostics: [] };
  const rubricIdentity = SlugSchema.parse(identity);
  let resolution: ReviewRubricBindingResolution;
  try {
    resolution = rubricPort.resolveReviewRubricBinding(rubricIdentity);
  } catch {
    resolution = unavailableBinding(rubricIdentity);
  }
  if (resolution.status === "unavailable") {
    return {
      reviewRubric: {
        state: "unavailable",
        identity: rubricIdentity,
        reason: resolution.reason,
      },
      diagnostics: resolution.diagnostics,
    };
  }
  if (resolution.binding.identity !== rubricIdentity) {
    return {
      reviewRubric: {
        state: "unavailable",
        identity: rubricIdentity,
        reason: "identity-mismatch",
      },
      diagnostics: [`rubric.${rubricIdentity}.identity-mismatch`],
    };
  }
  return {
    reviewRubric: {
      state: "resolved",
      identity: rubricIdentity,
      augmentation: resolution.binding.augmentation,
    },
    augmentation: resolution.binding.augmentation,
    diagnostics: resolution.diagnostics,
  };
}

function resolveAssurance(
  meta: Pick<MetaRecord, "workClass" | "reviewRubric">,
  activityPort: ReviewMethodActivityPort,
  rubricPort: ReviewRubricBindingPort,
): {
  readonly assurance: WorkUnitReviewAssurance;
  readonly augmentation?: StandardReviewProjectAugmentation;
  readonly diagnostics: readonly string[];
} {
  const workClass = WorkClassSchema.parse(meta.workClass);
  const rubric = resolveRubricOverlay(parseReviewRubric(meta.reviewRubric), rubricPort);
  return {
    assurance: WorkUnitReviewAssuranceSchema.parse({
      activity: resolveReviewMethodActivity(activityPort).activity,
      assurance: { workContext: "work-unit", workClass },
      reviewRubric: rubric.reviewRubric,
    }),
    ...(rubric.augmentation === undefined ? {} : { augmentation: rubric.augmentation }),
    diagnostics: rubric.diagnostics,
  };
}

/** Resolve WU review inputs without binding production method discovery. */
export function resolveWorkUnitReviewAssurance(
  meta: Pick<MetaRecord, "workClass" | "reviewRubric">,
  activityPort: ReviewMethodActivityPort,
  rubricPort: ReviewRubricBindingPort,
): WorkUnitReviewAssurance {
  return resolveAssurance(meta, activityPort, rubricPort).assurance;
}

/** Compose work-unit assurance from the registered review method files. */
export function composeWorkUnitReviewAssurance(
  meta: Pick<MetaRecord, "workClass" | "reviewRubric">,
  methodFiles: ReviewMethodFilePort,
  rubricPort: ReviewRubricBindingPort,
): ComposedWorkUnitReviewAssurance {
  const activity = bindReviewMethodActivity(methodFiles);
  const resolved = resolveAssurance(meta, activity.activityPort, rubricPort);
  const diagnostics = [...resolved.diagnostics, ...activity.diagnostics].sort();
  if (resolved.assurance.reviewRubric.state === "unavailable") {
    return { status: "refused", assurance: resolved.assurance, diagnostics };
  }
  return {
    status: "resolved",
    assurance: resolved.assurance,
    guidance: projectStandardReviewGuidance(resolved.augmentation),
    diagnostics,
  };
}
