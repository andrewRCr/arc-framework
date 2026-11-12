/** Fail one keeper deletion at the real Git boundary while preserving its observed lock. */
import { dirname, join } from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { onTestFinished } from "vitest";
import { createRefStore } from "../../../src/lib/store/index.js";
import type { RefSyncFixture } from "./ref-sync.js";

export async function keeperDeleteFault(side: RefSyncFixture["b"], target: string, fault: "lock" | "unrelated") {
  const format = (await side.git(["rev-parse", "--show-ref-format"])).stdout.trim();
  const lock = join(side.gitDir ?? join(side.root, ".git"), format === "reftable" ? "reftable/tables.list.lock" : `${target}.lock`);
  const unrelated = new Error("Unrelated deletion boundary failure");
  let armed = true;
  const release = () => rm(lock, { force: true });
  onTestFinished(release);
  const store = createRefStore({ ...side.ports, execInput: async (args, input, options) => {
    if (!armed || !args.includes("update-ref") || !input.includes(`delete ${target} `)) {
      return side.ports.execInput(args, input, options);
    }
    armed = false;
    if (fault === "unrelated") throw unrelated;
    await mkdir(dirname(lock), { recursive: true }); await writeFile(lock, "held fixture lock\n");
    const at = args.indexOf("update-ref");
    return side.ports.execInput([...args.slice(0, at), "-c", "core.filesRefLockTimeout=0", "-c", "reftable.lockTimeout=0", ...args.slice(at)], input, options);
  } });
  return { store, lock, unrelated, release };
}
