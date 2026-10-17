import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { refCarryFixture, carriedBranch, carriedDocument, carryProvenance } from "../helpers/store/ref-carry.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, PushInputSchema, PushResultSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { isGitProcessError } from "../../src/lib/git/process-error.js";

async function codeRaceFixture(mode: "leased" | "unleased", layout: "default" | "separate" = "default") {
  const h = await refCarryFixture(layout);
  success(await h.a.store.push());
  await h.a.exec("git", ["push", "origin", `${carriedBranch}:${carriedBranch}`]);
  const code = await plantRef(h.a.root, carriedBranch, [{ path: "local.txt", content: "Our code.\n" }],
    { parents: mode === "leased" ? [] : [h.code.tip] });
  const other = await plantRef(h.b.root, carriedBranch, [{ path: "remote.txt", content: "Other code.\n" }]);
  await h.b.exec("git", ["push", "origin", `${carriedBranch}:refs/test/code-race`]);
  const before = success(await h.a.store.read({ reference: carriedDocument }));
  success(await h.a.store.write({ action: "put", reference: carriedDocument, expected: before.version,
    content: "State after code race.\n", provenance: carryProvenance }));
  const marker = join(h.origin, "code-moved"), hook = join(h.origin, "hooks", "update");
  await writeFile(hook, `#!/bin/sh
if test "$1" = '${carriedBranch}' && ! test -f '${marker}'; then
  git update-ref "$1" '${other.tip}' "$2" || exit 2
  printf done > '${marker}'
fi
exit 0
`, { mode: 0o755 });
  return { h, code, other };
}

describe("carried branch receiver races", () => {
  it("still publishes state when the carried receiver tip cannot be read", async () => {
    const { h, other } = await codeRaceFixture("leased");
    const store = createRefStore({ ...h.a.ports, exec: (command, args, options) => {
      const targetAt = args.indexOf("--") + 1;
      return h.a.ports.exec(command, args.includes("ls-remote")
        ? args.map((arg, index) => index === targetAt ? join(h.origin, "missing.git") : arg) : args, options);
    } });
    const result = PushResultSchema.parse(success(await store.push(PushInputSchema.parse({ carry: { ref: carriedBranch, expect: h.code.tip } }))));
    expect(result.carry).toMatchObject({ ref: carriedBranch, status: "unreachable", cause: "error" });
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed", families: ["personal"] }));
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(other.tip);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("State after code race.\n");
  });
  it("attributes a receiver race on an ordered code leg without blocking state", async () => {
    const { h, other } = await codeRaceFixture("unleased", "separate");
    let observed = "";
    const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      try { return await h.a.ports.exec(command, args, options); }
      catch (error) {
        if (args.includes("push") && !observed) observed = (await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim();
        throw error;
      }
    } });
    const result = PushResultSchema.parse(success(await store.push({ carry: { ref: carriedBranch } })));
    expect(observed).toBe(other.tip);
    expect(result.carry).toMatchObject({ ref: carriedBranch, status: "refused", reason: "raced" });
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed", families: ["personal"] }));
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(other.tip);
    await expect(h.a.exec("git", ["cat-file", "-e", other.tip], { objectAccess: "local-only" })).rejects.toBeDefined();
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("State after code race.\n");
  });
  it.each(["leased", "unleased"] as const)("attributes every atomic collateral row using the %s carried branch", async (mode) => {
    const { h, code, other } = await codeRaceFixture(mode);
    let observed = "", porcelain = "";
    const observations: string[] = [];
    const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      try {
        const result = await h.a.ports.exec(command, args, options);
        if (args.includes("ls-remote")) observations.push(result.stdout);
        return result;
      } catch (error) {
        if (args.includes("push") && !observed) {
          observed = (await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim();
          if (isGitProcessError(error)) porcelain = error.stdout;
        }
        throw error;
      }
    } });
    const input = PushInputSchema.parse({ carry: { ref: carriedBranch, ...mode === "leased" ? { expect: h.code.tip } : {} } });
    const result = PushResultSchema.parse(success(await store.push(input)));
    expect(observed).toBe(other.tip);
    const rows = porcelain.split("\n").filter((line) => line.startsWith("!\t"));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((line) => line.includes("atomic transaction failed"))).toBe(true);
    expect(result.carry).toMatchObject({ ref: carriedBranch, status: "refused", reason: "raced" });
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed", families: ["personal"] }));
    expect(observations).toHaveLength(1);
    expect(observations[0]).toContain(other.tip);
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(other.tip);
    expect((await h.a.exec("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(code.tip);
    await expect(h.a.exec("git", ["cat-file", "-e", other.tip], { objectAccess: "local-only" })).rejects.toBeDefined();
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("State after code race.\n");
  });

  it("keeps an unattributed atomic failure terminal when the carried commit includes the moved tip", async () => {
    const h = await refCarryFixture("default");
    success(await h.a.store.push());
    await h.a.exec("git", ["push", "origin", `${carriedBranch}:${carriedBranch}`]);
    const middle = await plantRef(h.a.root, "refs/heads/middle", [{ path: "middle.txt", content: "Included intermediate code.\n" }], { parents: [h.code.tip] });
    const code = await plantRef(h.a.root, carriedBranch, [{ path: "local.txt", content: "Later code.\n" }], { parents: [middle.tip] });
    await h.a.exec("git", ["push", "origin", `${middle.tip}:refs/test/compatible-code`]);
    const before = success(await h.a.store.read({ reference: carriedDocument }));
    success(await h.a.store.write({ action: "put", reference: carriedDocument, expected: before.version,
      content: "Pending unattributed state.\n", provenance: carryProvenance }));
    const marker = join(h.origin, "compatible-code-moved");
    await writeFile(join(h.origin, "hooks", "update"), `#!/bin/sh
if test "$1" = '${carriedBranch}' && ! test -f '${marker}'; then
  git update-ref "$1" '${middle.tip}' "$2" || exit 2
  printf done > '${marker}'
fi
exit 0
`, { mode: 0o755 });
    const result = PushResultSchema.parse(success(await h.a.store.push({ carry: { ref: carriedBranch } })));
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "failed", failure: expect.objectContaining({
      code: "refused", class: "terminal", message: expect.stringContaining("atomic transaction failed"),
    }) }));
    expect(result.carry).toMatchObject({ ref: carriedBranch, status: "refused", reason: "remote-rejected" });
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(middle.tip);
    expect(success(await h.a.store.read({ reference: carriedDocument })).content).toBe("Pending unattributed state.\n");
    const next = PushResultSchema.parse(success(await h.a.store.push({ carry: { ref: carriedBranch } })));
    expect(next.carry).toEqual({ ref: carriedBranch, status: "pushed" });
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(code.tip);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("Pending unattributed state.\n");
  });

  it("releases an unattributed code leg when the next pull finds its state already published", async () => {
    const h = await refCarryFixture("default"), state = "refs/arc/user/andrew/personal";
    success(await h.a.store.push()); success(await h.b.store.pull());
    const published = (await h.remote("git", ["rev-parse", state])).stdout.trim();
    await h.a.exec("git", ["push", "origin", `${carriedBranch}:${carriedBranch}`]);
    const middle = await plantRef(h.a.root, "refs/heads/middle", [{ path: "middle.txt", content: "Included code.\n" }], { parents: [h.code.tip] });
    const code = await plantRef(h.a.root, carriedBranch, [{ path: "later.txt", content: "Final code.\n" }], { parents: [middle.tip] });
    const before = success(await h.a.store.read({ reference: carriedDocument }));
    success(await h.a.store.write({ action: "put", reference: carriedDocument, expected: before.version, content: "Already included state.\n", provenance: carryProvenance }));
    await h.a.git(["push", "origin", `${state}:refs/test/included-state`, `${middle.tip}:refs/test/included-code`]);
    await h.b.git(["fetch", "origin", `refs/test/included-state:${state}`]);
    const extra = RecordReferenceSchema.parse({ ...carriedDocument, key: "remote-extra.md" });
    success(await h.b.store.write({ action: "put", reference: extra, expected: null, content: "Other state.\n", provenance: carryProvenance }));
    const incoming = (await h.b.git(["rev-parse", state])).stdout.trim();
    await h.b.git(["push", "origin", `${state}:refs/test/other-state`]);
    const marker = join(h.origin, "both-moved");
    await writeFile(join(h.origin, "hooks", "update"), `#!/bin/sh
if test "$1" = '${carriedBranch}' && ! test -f '${marker}'; then
  git update-ref "$1" '${middle.tip}' "$2" || exit 2
  git update-ref '${state}' '${incoming}' '${published}' || exit 2
  printf done > '${marker}'
fi
exit 0
`, { mode: 0o755 });
    const result = PushResultSchema.parse(success(await h.a.store.push({ carry: { ref: carriedBranch } })));
    expect(result.carry).toEqual({ ref: carriedBranch, status: "pushed" });
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "reconciled", families: ["personal"], retryCount: 1 }));
    expect((await h.remote("git", ["rev-parse", state])).stdout.trim()).toBe(incoming);
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(code.tip);
    expect(success(await h.a.store.read({ reference: carriedDocument })).content).toBe("Already included state.\n");
    expect(success(await h.a.store.read({ reference: extra })).content).toBe("Other state.\n");
  });
});
