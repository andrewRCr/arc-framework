/** Acquire the import's actual lifecycle composition and both held identity inputs for live membership. */
import type { WindowImportContext } from "./import-context.js";
import type { WindowCheckout } from "./checkouts.js";
import { deriveWindowLiveBranches, type WindowLiveBranch, type WindowLiveBranchInput } from "./live-branches.js";
import type { ComposedLifecycleIndexResult } from "../../lib/work-unit/composed-lifecycle-index.js";
import { createInRepoContext } from "../../lib/store/in-repo/context.js";
import { composedMetas } from "../../lib/store/in-repo/meta.js";
import { listWindowRefs } from "./git.js";
import { readWindowTransientRecords } from "./transients.js";
import { WindowRefusal } from "./result.js";

/** One composition retained alongside its derived branch observations. */
export interface WindowLiveState { composition: ComposedLifecycleIndexResult; branches: Record<string, WindowLiveBranch> }

/** Read composition once and derive membership from its selection and acquired local/origin identity records. */
export async function readWindowLiveState(context: WindowImportContext, checkouts: readonly WindowCheckout[],
  branches: Pick<WindowLiveBranchInput, "local" | "origin">): Promise<WindowLiveState> {
  const io = { repo: context.checkoutRoot, exec: context.exec };
  const originPrefix = "refs/arc-window/origin/";
  const [composition, refs] = await Promise.all([
    composedMetas(createInRepoContext(context.importSource.ports)),
    listWindowRefs(io, ["refs/arc/user/", `${originPrefix}refs/arc/user/`]),
  ]);
  const local = Object.fromEntries([...refs].filter(([ref]) => ref.startsWith("refs/arc/user/")));
  const origin = Object.fromEntries([...refs].filter(([ref]) => ref.startsWith(originPrefix)).map(([ref, tip]) => [ref.slice(originPrefix.length), tip]));
  const [localInput, originInput] = await Promise.all([readWindowTransientRecords(io, local), readWindowTransientRecords(io, origin)]);
  const findings = [...localInput.findings, ...originInput.findings];
  if (findings.length > 0) throw new WindowRefusal(findings);
  return { composition, branches: deriveWindowLiveBranches({ composition, checkouts, ...branches,
    identities: [{ side: "local", records: localInput.records }, { side: "origin", records: originInput.records }] }) };
}
