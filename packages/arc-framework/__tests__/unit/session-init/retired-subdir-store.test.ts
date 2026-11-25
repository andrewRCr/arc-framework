import { expect, it } from "vitest";
import { runRetiredSubdirDetection, analyzeRetiredSubdirSnapshot } from "../../../src/lib/session-init/retired-subdir-detection.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
it.each(["run", "snapshot"] as const)("offbranch retired %s returns no candidates before accessing filesystem or Git evidence", async mode => {
  const { store } = createLifecycleHarness();
  const unreadable = async (): Promise<never> => { throw new Error("Retired evidence must not be read"); };
  const result = mode === "run"
    ? await runRetiredSubdirDetection({ store, cwd: "/project", identity: "test-user", baseBranch: "main", get exec(): never { throw new Error("Git boundary was read"); }, get readDir(): never { throw new Error("Filesystem boundary was read"); }, get readFile(): never { throw new Error("Filesystem reader was read"); } })
    : await analyzeRetiredSubdirSnapshot({ store, exec: unreadable, localSubdirs: ["shipped"], baseBranch: "main", remoteSyncEnabled: true, snapshot: { kind: "available", scope: "all-heads", tips: { main: "a".repeat(40) } }, objectAvailability: { kind: "complete", commits: { ["a".repeat(40)]: true } } });
  expect(result).toEqual({ candidates: [] });
});
