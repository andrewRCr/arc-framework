/** Read checkout positions through the production locus probe and the invocation's selected store. */
import type { Store } from "../../lib/store/contract.js";
import type { GitExec } from "../../lib/git/exec.js";
import type { DerivedCheckoutRow } from "../../lib/locus/derived-roster.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import { runDerivedLocusStateProbe } from "../derived-locus-state-probe.js";

/** Acquire the roster as one reading identity, retaining the caller's operational store when supplied. */
export async function readStatusCheckoutRoster(input: { cwd: string; exec: GitExec; store?: Store }, identity: string): Promise<readonly DerivedCheckoutRow[]> {
  const { settings } = await readConfigSettings(input.cwd);
  const frame = await runDerivedLocusStateProbe({ ...input, identity, baseBranch: settings["branch.base"] });
  return frame.roster;
}
