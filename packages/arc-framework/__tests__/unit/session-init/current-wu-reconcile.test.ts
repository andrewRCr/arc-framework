/**
 * Read-only current-WU reconcile facts for session entry.
 */

import { describe, expect, it } from "vitest";

import { runCurrentWuReconcileSessionProbe } from "../../../src/lib/session-init/current-wu-reconcile.js";
import { buildLifecycleIndexFromMetas } from "../../../src/lib/work-unit/lifecycle-index.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";

const META_PATH = ".arc/active/meta-dependent.md";

function meta(dependsOn: string): string {
  return makeMetaFixture("dependent", {
    dependsOn: dependsOn === "[none]" ? [] : [dependsOn.replaceAll("`", "")],
  });
}

describe("runCurrentWuReconcileSessionProbe", () => {
  it("surfaces pending tracked edits without exposing a write boundary", async () => {
    let reads = 0;
    const result = await runCurrentWuReconcileSessionProbe({
      index: buildLifecycleIndexFromMetas([
        { path: META_PATH, content: meta("`retired`") },
        { path: ".arc/active/meta-successor.md", content: makeMetaFixture("successor") },
      ]),
      queryDisposition: () => Promise.resolve({
        status: "unique",
        disposition: { kind: "retarget", targetSlug: "successor" },
      }),
      readFile: () => {
        reads += 1;
        return Promise.resolve(meta("`retired`"));
      },
    }, { slug: "dependent", metaPath: META_PATH });

    expect(result).toMatchObject({
      status: "pending",
      slug: "dependent",
      dependency: { before: ["retired"], after: ["successor"] },
      recommendedAction: "surface",
      recommendedCommand: ["arc", "wu", "reconcile", "dependent", "--apply", "--json"],
    });
    expect(result.recommendedPromptText).toContain("arc wu reconcile dependent --apply --json");
    expect(reads).toBe(1);
  });

  it("surfaces a typed conflict without mutation", async () => {
    const result = await runCurrentWuReconcileSessionProbe({
      index: buildLifecycleIndexFromMetas([{ path: META_PATH, content: meta("`retired`") }]),
      queryDisposition: () => Promise.resolve({ status: "ambiguous" }),
      readFile: () => Promise.resolve(meta("`retired`")),
    }, { slug: "dependent", metaPath: META_PATH });

    expect(result).toMatchObject({
      status: "conflict",
      reason: "ambiguous-evidence",
      recommendedAction: "surface",
      recommendedCommand: ["arc", "wu", "reconcile", "dependent", "--json"],
    });
    expect(result.recommendedPromptText).toMatch(/blocked.*ambiguous-evidence/iu);
  });

  it("keeps a clean reconcile silent", async () => {
    const result = await runCurrentWuReconcileSessionProbe({
      index: buildLifecycleIndexFromMetas([{ path: META_PATH, content: meta("[none]") }]),
      queryDisposition: () => Promise.resolve({ status: "absent" }),
      readFile: () => Promise.resolve(meta("[none]")),
    }, { slug: "dependent", metaPath: META_PATH });

    expect(result).toMatchObject({
      status: "clean",
      recommendedAction: "skip",
      recommendedCommand: null,
      recommendedPromptText: "",
    });
  });
});
