import { describe, expect, it } from "vitest";
import { validateStoreHuskEvidence } from "../../../src/lib/work-unit/store-retirement-husk.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { boundWorkUnitSubject } from "../../helpers/store/bound-checkout.js";
import { makeHuskStamp } from "../../helpers/worktree-husk-fixture.js";
import { ArchiveQuarterSchema, canonicalDigest } from "../../../src/lib/kernel/index.js";
import { renderMetaFile } from "../../../src/lib/store/kinds/meta/writers.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import type { Store } from "../../../src/lib/store/contract.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

describe("native husk advisory evidence", () => {
  it("treats a live owner as a mismatch and accepts its repaired terminal evidence", async () => {
    const h = createLifecycleHarness(), meta = await h.seedMeta("demo"), sha = "a".repeat(40);
    const content = renderMetaFile("demo", { state: "Shipped", owner: "test-user", currentWorkflow: null });
    const subject = boundWorkUnitSubject(meta);
    const marker = { spawnedByArc: true, createdFor: subject, spawningIdentity: "test-user", createdAt: "2026-11-13T00:00:00Z",
      husk: makeHuskStamp({ sha, at: "2026-11-13T00:00:00Z", subject, branch: "feat/demo",
        authorization: "merged-preserved", evidence: { kind: "shipped", expectedLifecycle: "completed",
          resultDigest: canonicalDigest(content), baseProofOid: sha } }) };
    const exec: GitExec = async () => ({ stdout: "" });
    const check = (store: Store) => validateStoreHuskEvidence({ store, exec, marker, baseOid: sha });
    await expect(check(h.store)).resolves.toBe(false);
    lifecycleSuccess(await h.store.write({ ...recordPut(meta, { content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
      provenance: { verb: "archive", lifecycleAction: "archive" } }));
    await expect(check(h.store)).resolves.toBe(true);
    const unavailable: Store = Object.create(h.store) as Store;
    unavailable.read = () => Promise.reject(new Error("store unavailable"));
    await expect(check(unavailable)).rejects.toThrow("store unavailable");
  });
});
