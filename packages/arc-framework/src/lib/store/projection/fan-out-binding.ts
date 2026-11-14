/** Bind advisory store notifications to the command and code clone that own their projection ports. */
import type { RecordReference } from "../identity.js";
import type { ProjectionLocation } from "./location.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import type { FanOutDependencies } from "./with-fan-out.js";
import { resolve } from "node:path";
import { readGitDirectories } from "../../git/directories.js";
import { projectionProcessState, type FanOutScope } from "./process-state.js";
import { requestProjectionFanOut, reportProjectionFanOutFailure } from "./fan-out-scheduler.js";

/** The source checkout and native metadata established by command entry. */
export interface ProjectionFanOutBindingInput {
  readonly checkout: string;
  readonly location: ProjectionLocation;
  readonly ports: Pick<ProjectionEnginePorts, "fs">;
  readonly run: (ownWrites: readonly RecordReference[], round: number, scope?: FanOutScope) => Promise<readonly RecordReference[] | undefined>;
}

/** Ephemeral command authority; stores capture the object rather than a later command's current runner. */
export interface ProjectionFanOutBinding {
  active: boolean;
  readonly contains: (checkout: string) => Promise<boolean>;
  readonly close: () => void;
}

/** Install a runner after the command's projection ports and source repository resolve. */
export async function bindProjectionFanOut(input: ProjectionFanOutBindingInput): Promise<void> {
  disposeProjectionFanOut();
  const state = projectionProcessState();
  try {
    const common = await input.ports.fs.realpath(input.location.commonDir);
    const members = new Map<string, Promise<boolean>>([[resolve(input.checkout), Promise.resolve(true)]]);
    const binding: ProjectionFanOutBinding = { active: true, contains: checkout => {
      const key = resolve(checkout), known = members.get(key);
      if (known !== undefined) return known;
      const observed = belongsToClone(input, key, common);
      members.set(key, observed);
      return observed;
    }, close: () => {
      binding.active = false;
      members.clear();
      if (state.fanOutBinding !== binding) return;
      state.fanOutBinding = undefined;
      clearRunner();
    } };
    state.fanOutBinding = binding;
    state.fanOut = input.run;
  } catch (cause) { reportProjectionFanOutFailure(input.checkout, cause); }
}

/** Capture lazy notification dependencies without reading configuration or repository metadata at store construction. */
export function createProjectionFanOutDependencies(checkout: string): FanOutDependencies {
  return { capture: () => {
    const state = projectionProcessState(), binding = state.fanOutBinding;
    if (binding === undefined || !binding.active || state.skip?.reason === "switch" || state.skip?.reason === "no-identity") return null;
    const current = (): boolean => binding.active && state === projectionProcessState() && state.fanOutBinding === binding;
    return async references => {
      if (!current() || !await binding.contains(checkout) || !current()) return;
      await requestProjectionFanOut(checkout, references);
    };
  }, report: cause => { reportProjectionFanOutFailure(checkout, cause); } };
}

/** Close fan-out while preserving roots and diagnostics needed by command-end settlement and reporting. */
export function disposeProjectionFanOut(): void {
  const state = projectionProcessState();
  state.fanOutBinding?.close();
  clearRunner();
}

function clearRunner(): void {
  const state = projectionProcessState();
  state.fanOut = undefined;
  state.fanOutRounds.clear();
  state.fanOutOwnWrites = [];
}

async function belongsToClone(input: ProjectionFanOutBindingInput, checkout: string, common: string): Promise<boolean> {
  try {
    const known = projectionProcessState().roots.get(checkout)?.location;
    const directories = known ?? await readGitDirectories(checkout, input.ports.fs);
    return await input.ports.fs.realpath(directories.commonDir) === common;
  } catch (cause) { reportProjectionFanOutFailure(checkout, cause); return false; }
}
