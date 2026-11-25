/** Once-per-calendar-day advisory marker contract shared by session slots. */
import { z } from "zod";
/** Marker facts resolved by the caller without performing a nudge write. */
export const NudgeMarkerStateSchema = z.strictObject({
  shouldNudge: z.boolean(), markerPath: z.string().nullable(), today: z.string(),
});
