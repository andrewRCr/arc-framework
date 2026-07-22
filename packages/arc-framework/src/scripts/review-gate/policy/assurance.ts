/** WU assurance composition over injected activity and rubric availability. */

import { parseReviewRubric, type MetaRecord } from "../../../lib/active/meta-reader.js";
import { WorkClassSchema } from "../../../lib/kernel/index.js";
import {
  WorkUnitReviewAssuranceSchema,
  type ReviewRubricOverlayResolution,
  type WorkUnitReviewAssurance,
} from "./assurance-schema.js";
import {
  resolveReviewMethodActivity,
  type ReviewMethodActivityPort,
} from "./activity.js";

/** Availability seam; method discovery and registry binding stay in its adapter. */
export interface ReviewRubricAvailabilityPort {
  isReviewRubricAvailable(identity: string): boolean;
}

/** Resolve WU review inputs without binding production method discovery. */
export function resolveWorkUnitReviewAssurance(
  meta: Pick<MetaRecord, "Class" | "Review Rubric">,
  activityPort: ReviewMethodActivityPort,
  rubricPort: ReviewRubricAvailabilityPort,
): WorkUnitReviewAssurance {
  const workClass = WorkClassSchema.parse(meta.Class);
  const identity = parseReviewRubric(meta["Review Rubric"]);
  let reviewRubric: ReviewRubricOverlayResolution = { state: "absent" };
  if (identity !== null) {
    const available = (() => {
      try {
        return rubricPort.isReviewRubricAvailable(identity);
      } catch {
        return false;
      }
    })();
    reviewRubric = available
      ? { state: "resolved", identity }
      : { state: "unavailable", identity };
  }

  return WorkUnitReviewAssuranceSchema.parse({
    activity: resolveReviewMethodActivity(activityPort).activity,
    assurance: { workContext: "work-unit", workClass },
    reviewRubric,
  });
}
