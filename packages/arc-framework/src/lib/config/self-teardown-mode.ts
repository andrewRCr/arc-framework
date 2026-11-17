/** Personal preference for retaining or removing a terminal self checkout. */
import { resolveGitConfigOverride, type ResolvedConfigOverride } from "./resolve-override.js";
import type { ResolveSingleKeyOptions } from "./resolved-settings.js";

/** Physical disposition requested for a self-teardown. */
export type SelfTeardownMode = "husk" | "remove";
/** Git applies its normal effective local/global precedence to this personal preference. */
export const SELF_TEARDOWN_MODE_GIT_CONFIG_KEY = "arc.selfTeardownMode";

/** Resolve the personal preference, warning and retaining the folder for invalid values. */
export function resolveSelfTeardownMode(options: ResolveSingleKeyOptions): Promise<ResolvedConfigOverride<SelfTeardownMode>> {
  return resolveGitConfigOverride<SelfTeardownMode>({ ...options,
    gitConfigKey: SELF_TEARDOWN_MODE_GIT_CONFIG_KEY, defaultValue: "husk", validValues: ["husk", "remove"],
    isValidValue: (value): value is SelfTeardownMode => value === "husk" || value === "remove",
  });
}
