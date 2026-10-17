/** Real ref-store ports with per-test cleanup and process-count observation. */

import { onTestFinished } from "vitest";
import { createRefStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../src/lib/store/default-ports.js";
import { SlugSchema } from "../../../src/lib/kernel/schema/slug.js";
import { createExecaRawGitExec } from "../../../src/lib/git/process-executor.js";
import type { RefStorePorts } from "../../../src/lib/store/ports.js";
import { createRefClock } from "./ref-clock.js";
import { createRefTestRepository } from "./ref-plant.js";

export async function createRefReadFixture(format: "files" | "reftable" = "files", maxBuffer?: number, objectFormat?: "sha1" | "sha256") {
  const repo = await createRefTestRepository(format, objectFormat);
  onTestFinished(repo.cleanup);
  let processes = 0;
  const raw = createExecaRawGitExec(repo.root, maxBuffer);
  const count = () => { processes += 1; };
  const defaults = createDefaultStorePorts({ checkoutRoot: repo.root });
  const ports: RefStorePorts = {
    ...defaults, backingRepository: async () => null, identity: async () => SlugSchema.parse("andrew"),
    exec: async (...args) => { count(); return defaults.exec(...args); },
    execInput: async (...args) => { count(); return defaults.execInput(...args); },
    rawExec: async (...args) => { count(); return raw(...args); },
    actor: async () => "unused", random: () => 0.5,
    ...createRefClock(), lock: async () => async () => {},
  };
  return { ...repo, ports, store: createRefStore(ports), processes: () => processes };
}
