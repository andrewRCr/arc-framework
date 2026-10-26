/** Carry capture reports deadline cancellation before publication while retaining diagnostics and local data. */
import { describe, expect, it } from "vitest";
import { createRefStore } from "../../src/lib/store/index.js";
import { carriedBranch, carriedDocument, refCarryFixture } from "../helpers/store/ref-carry.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { success } from "../helpers/store/suite-tools.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";

describe.each(["default", "separate"] as const)("carry acquisition cancellation in %s", layout => {
  it.each(["configuration", "tip"] as const)("reports a canceled %s read and admits a fresh push", async phase => {
    const h = await refCarryFixture(layout), clock = createRefClock(new Date(0), 0);
    let interrupted = false;
    const failure = new GitProcessError({ ...makeGitProcessError({ command: "git", args: [], isCanceled: true,
      stderr: `Concrete canceled carry ${phase} diagnostic.` }), descendantsUnconfirmed: true });
    const store = createRefStore({ ...h.a.ports, ...clock,
      rawExec: async (args, options) => {
        if (!interrupted && phase === "configuration" && args.includes("config")) {
          interrupted = true; clock.advance(120_000); throw failure;
        }
        return h.a.ports.rawExec(args, options);
      },
      exec: async (command, args, options) => {
        if (!interrupted && phase === "tip" && args.includes("rev-parse") && args.includes(`${carriedBranch}^{commit}`)) {
          interrupted = true; clock.advance(120_000); throw failure;
        }
        return h.a.ports.exec(command, args, options);
      },
    });
    const result = await store.push({ carry: { ref: carriedBranch } });
    expect(interrupted).toBe(true);
    expect(result).toMatchObject({ status: "refused", refusal: { code: "unreachable", class: "recoverable", cause: "timeout",
      condition: expect.stringContaining(failure.message), remedy: { text: expect.stringMatching(/retry.*push/iu) } } });
    if (result.status !== "refused") throw new Error("Expected carry-capture timeout refusal");
    expect(result.refusal.condition).toContain(`Concrete canceled carry ${phase} diagnostic.`);
    expect(result.refusal.condition).toContain("descendant processes not confirmed ended");
    expect(success(await store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
    const retried = success(await store.push({ carry: { ref: carriedBranch } }));
    expect(retried.carry).toMatchObject({ status: "pushed", ref: carriedBranch });
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(h.code.tip);
  });
});
