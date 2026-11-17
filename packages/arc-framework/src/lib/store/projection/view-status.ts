/** Compose explicit status diagnostics from the command's configuration observation and selected store. */
import type { GitExec } from "../../git/exec.js";
import type { Store } from "../contract.js";
import type { ProjectionViewStatus } from "./status.js";
import { observeProjectionConfiguration } from "./command-configuration.js";
import { readProjectionConfiguration } from "./configuration.js";
import { interpretProjectionView } from "./view-settings.js";
import { selectProjectionView, type ProjectionViewSelection } from "./view-selection.js";
import { readCheckoutLayoutContext } from "../checkout-layout.js";
import { readAdoptionClaim } from "./adoption-claim.js";
import { ArcError, type Slug } from "../../kernel/index.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { OwnerIdentity } from "../identity.js";

/** Native inputs remain bound to the command's selected checkout and store. */
export interface ProjectionViewStatusInput {
  readonly checkout: string;
  readonly store: Store;
  readonly exec: GitExec;
}

/** Reuse an existing observation, reading it once for a standalone status caller when needed. */
export async function readProjectionViewStatus(input: ProjectionViewStatusInput): Promise<ProjectionViewStatus> {
  const config = await observeProjectionConfiguration(input.checkout, () => readProjectionConfiguration(input.exec, input.checkout));
  const interpreted = interpretProjectionView(config.view);
  const diagnostics = [...interpreted.diagnostics];
  if (config.identity.status === "no-identity") diagnostics.push({
    reason: `The in-flight view cannot be selected with an ${config.identity.cause} identity.`, remedy: config.identity.remedy,
  });
  else {
    const selection = await selectStatusView(input, config.identity.identity, interpreted.view);
    if (selection.kind === "unavailable") diagnostics.push(...selection.diagnostics);
    else for (const pin of selection.missingPins) diagnostics.push({
      reason: `arc.inflightPin ${JSON.stringify(pin)} names no in-flight work item.`,
      remedy: { text: "Remove that pin or name an active work item, then retry status." },
    });
  }
  return { ...interpreted.view, diagnostics };
}

async function selectStatusView(input: ProjectionViewStatusInput, identity: Slug,
  view: ProjectionIndex["projectedUnder"]["view"]): Promise<ProjectionViewSelection> {
  let layout;
  try { layout = await readCheckoutLayoutContext(input.checkout); }
  catch (error) {
    if (!(error instanceof ArcError)) throw error;
    return { kind: "unavailable", references: [], diagnostics: [{ reason: error.message,
      remedy: { text: "Repair the checkout's ownership marker or project configuration, then retry status." } }] };
  }
  let own: OwnerIdentity | null = null;
  if (layout.claim !== null) {
    const claim = await readAdoptionClaim({ checkout: input.checkout, store: input.store, claim: layout.claim, context: {} });
    if (claim.kind === "refused") return { kind: "unavailable", references: [], diagnostics: [claim.mark] };
    own = claim.record.reference.owner;
  }
  return selectProjectionView({ store: input.store, identity, view, own });
}
