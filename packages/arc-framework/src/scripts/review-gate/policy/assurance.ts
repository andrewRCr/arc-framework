/** WU assurance composition over injected activity and rubric availability. */

import { parseReviewRubric, type MetaRecord } from "../../../lib/active/meta-reader.js";
import { WorkClassSchema } from "../../../lib/kernel/index.js";
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

/** Identity-keyed rubric binding seam; method discovery stays in its adapter. */
export interface ReviewRubricBindingPort {
  resolveReviewRubricBinding(identity: string): { identity: string } | null;
}

/** Production-composed assurance plus non-fatal method-declaration diagnostics. */
export interface ComposedWorkUnitReviewAssurance {
  readonly assurance: WorkUnitReviewAssurance;
  readonly diagnostics: readonly string[];
}

/** Resolve WU review inputs without binding production method discovery. */
export function resolveWorkUnitReviewAssurance(
  meta: Pick<MetaRecord, "Class" | "Review Rubric">,
  activityPort: ReviewMethodActivityPort,
  rubricPort: ReviewRubricBindingPort,
): WorkUnitReviewAssurance {
  const workClass = WorkClassSchema.parse(meta.Class);
  const identity = parseReviewRubric(meta["Review Rubric"]);
  let reviewRubric: ReviewRubricOverlayResolution = { state: "absent" };
  if (identity !== null) {
    const binding = (() => {
      try {
        return rubricPort.resolveReviewRubricBinding(identity);
      } catch {
        return null;
      }
    })();
    reviewRubric = binding?.identity === identity
      ? { state: "resolved", identity }
      : { state: "unavailable", identity };
  }

  return WorkUnitReviewAssuranceSchema.parse({
    activity: resolveReviewMethodActivity(activityPort).activity,
    assurance: { workContext: "work-unit", workClass },
    reviewRubric,
  });
}

/** Compose work-unit assurance from the registered review method files. */
export function composeWorkUnitReviewAssurance(
  meta: Pick<MetaRecord, "Class" | "Review Rubric">,
  methodFiles: ReviewMethodFilePort,
  rubricPort: ReviewRubricBindingPort,
): ComposedWorkUnitReviewAssurance {
  const activity = bindReviewMethodActivity(methodFiles);
  return {
    assurance: resolveWorkUnitReviewAssurance(meta, activity.activityPort, rubricPort),
    diagnostics: activity.diagnostics,
  };
}
