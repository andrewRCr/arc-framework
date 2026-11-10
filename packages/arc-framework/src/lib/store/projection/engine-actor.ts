/** Resolve the identity label shared by projection roots in one clone. */
import { join } from "node:path";
import type { Slug } from "../../kernel/index.js";
import { readMachineIdFile } from "../machine-id.js";
import { projectionProcessState } from "./process-state.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import type { ProjectionLocation } from "./location.js";

/** Resolve once per identity and clone without asking Git for the already located common directory. */
export function resolveProjectionActor(ports: ProjectionEnginePorts, location: ProjectionLocation, identity: Slug): Promise<string> {
  const actors = projectionProcessState().actors;
  const key = JSON.stringify([location.commonDir, identity]);
  let actor = actors.get(key);
  if (actor === undefined) {
    actor = ports.actor(identity, location.commonDir);
    actors.set(key, actor);
  }
  return actor;
}

/** Read an existing target identity label without creating an ID for a provisional feasibility check. */
export async function readProjectionActor(ports: ProjectionEnginePorts, location: ProjectionLocation, identity: Slug): Promise<string> {
  const id = await readMachineIdFile(ports.fs, join(location.commonDir, "arc", "user", identity, ".internal", ".machine-id"));
  return id === null ? identity : `${identity}@${id}`;
}
