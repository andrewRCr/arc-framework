/** Configured source order and pass ceiling for one review lane. */

import type { ConfigSettings } from "../../../lib/config/schema.js";
import { parseReviewSourceIds } from "../hosts/local/frontline-source-preferences.js";
import type { FrontlineSourcePreferenceReader } from "./frontline-source.js";

/** One lane's configured source order and pass ceiling. */
export interface LanePolicyConfig {
  readonly sources: readonly string[];
  readonly maxPasses: number;
}

/**
 * Resolve one lane's configured source order and pass ceiling.
 *
 * The frontline lane prefers the developer's ordered sources and falls back to the project's;
 * the standard lane reads its project list alone. Both orders are preserved exactly, because the
 * driver reads position as reservation rank.
 *
 * @param input - The lane, the resolved project settings, and the frontline preference reader.
 * @returns The lane's ordered sources and its configured pass ceiling.
 */
export async function resolveConfiguredLanePolicy(input: {
  lane: "frontline" | "standard";
  settings: ConfigSettings;
  preferences: FrontlineSourcePreferenceReader;
}): Promise<LanePolicyConfig> {
  let sources: readonly string[] | undefined;
  if (input.lane === "frontline") {
    const developerSources = await input.preferences.readDeveloperSourceIds();
    sources = developerSources.length > 0
      ? developerSources
      : await input.preferences.readProjectSourceIds();
  }
  sources ??= parseReviewSourceIds(input.settings["review.standard_sources"]);
  return {
    sources,
    maxPasses: Number(
      input.settings[input.lane === "frontline"
        ? "review.frontline_max_passes"
        : "review.standard_max_passes"],
    ),
  };
}
