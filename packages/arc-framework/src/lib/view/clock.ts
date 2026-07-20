/** User-scoped clock-format resolution for `arc view`. */

import type { GitExec } from "../git/index.js";
import { resolveGitConfigOverride } from "../config/resolve-override.js";

export const VIEW_CLOCKS = ["24h", "12h"] as const;
export type ViewClock = typeof VIEW_CLOCKS[number];

export const VIEW_CLOCK_GIT_CONFIG_KEY = "arc.viewClock";

export interface ResolvedViewClock {
  clock: ViewClock;
  warnings: string[];
}

/** Resolve the personal clock override, defaulting to 24-hour output. */
export async function resolveViewClock(options: {
  cwd: string;
  exec: GitExec;
  readFile: (path: string) => Promise<string>;
}): Promise<ResolvedViewClock> {
  const warnings: string[] = [];
  const resolved = await resolveGitConfigOverride<ViewClock>({
    ...options,
    gitConfigKey: VIEW_CLOCK_GIT_CONFIG_KEY,
    defaultValue: "24h",
    isValidValue: isViewClock,
    validValues: VIEW_CLOCKS,
    warn: (message) => warnings.push(message),
  });
  return { clock: resolved.value, warnings };
}

/** Whether a string is a supported viewer clock format. */
export function isViewClock(value: string): value is ViewClock {
  return (VIEW_CLOCKS as readonly string[]).includes(value);
}
