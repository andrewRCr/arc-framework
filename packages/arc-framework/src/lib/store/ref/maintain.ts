/** Pack plumbing-only state repositories and report growth of permanent refs. */
import type { RefBackendContext } from "./context.js";
import type { StoreResult } from "../refusal.js";
import type { MaintainResult } from "../sync.js";
import { readRefRepository } from "./repository.js";
import { readRefTips } from "./batch-read.js";

/** Measure captured permanent tips, omitting absent refs and other people's state. */
export async function maintainRefStore(context: RefBackendContext): Promise<StoreResult<MaintainResult>> {
  context = await readRefRepository(context);
  const tips = await readRefTips(context);
  await context.exec("git", ["maintenance", "run", "--auto"], { cwd: context.checkoutRoot, objectAccess: "local-only" });
  const identity = await context.identity();
  const refs = [...identity ? [`refs/arc/user/${identity}/personal`, `refs/arc/user/${identity}/claims`] : [],
    "refs/arc/project/inbox", "refs/arc/project/registry"];
  const measurements: NonNullable<MaintainResult["measurements"]> = [];
  for (const ref of refs) {
    const tip = tips.get(ref);
    if (!tip) continue;
    const commits = await measure(context, ["--count", tip]);
    const diskBytes = await measure(context, ["--disk-usage", "--objects", tip]);
    measurements.push({ ref, commits, diskBytes });
  }
  return { status: "ok", result: { measurements } };
}

async function measure(context: RefBackendContext, args: string[]): Promise<number> {
  const { stdout } = await context.exec("git", ["rev-list", ...args], { cwd: context.checkoutRoot, objectAccess: "local-only" });
  const value = Number(stdout.trim());
  if (!/^\d+$/u.test(stdout.trim()) || !Number.isSafeInteger(value)) throw new Error("Git returned an invalid ref growth measurement");
  return value;
}
