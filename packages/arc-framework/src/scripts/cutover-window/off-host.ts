/** Bind import admission to the primary checkout and the host's current branch tips. */
import type { WindowRecord } from "./hold.js";
import { windowBranchValue } from "./git.js";
import type { WindowCheckout } from "./checkouts.js";
import type { WindowFinding } from "./result.js";
import { localPathsEqual } from "../../lib/local-path-identity.js";

/** Refuse the importing checkout before composing records from a different checkout or branch. */
export async function readWindowImportPlacementFindings(repo: string,
  checkouts: readonly Pick<WindowCheckout, "path" | "primary" | "branch">[]): Promise<WindowFinding[]> {
  const primary = checkouts.find(checkout => checkout.primary);
  if (primary && primary.branch === "main" && await localPathsEqual(repo, primary.path)) return [];
  return [{ subject: repo, condition: "The importing checkout must be the primary on main.",
    remedy: `Return the primary checkout to main and retry with --repo ${primary?.path ?? "<primary checkout>"}.` }];
}

/** Compare the primary HEAD and live fetched tips with their captured host observations. */
export function windowHostTipFindings(branches: Pick<WindowRecord["branches"], "origin" | "host" | "live">,
  importingHead: string | undefined): WindowFinding[] {
  const findings: WindowFinding[] = [];
  if (importingHead === undefined || branches.host.main !== importingHead) findings.push({ subject: "main",
    condition: `Importing main HEAD ${importingHead ?? "unavailable"} differs from host ${branches.host.main ?? "absent"}.`,
    remedy: "Pull main in the importing primary checkout, then retry check." });
  for (const branch of Object.keys(branches.live)) {
    if (branch === "main") continue;
    const fetched = windowBranchValue(branches.origin, branch) ?? null, host = windowBranchValue(branches.host, branch);
    if (host === undefined || fetched !== host) findings.push({ subject: branch,
      condition: `Fetched tip ${fetched ?? "absent"} differs from host ${host === undefined ? "unavailable" : host ?? "absent"}.`,
      remedy: "Fetch origin again, restore readable host evidence if unavailable, then retry check." });
  }
  return findings;
}
