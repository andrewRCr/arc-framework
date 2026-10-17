/** Atomic landing, resumable migration steps, and publication of the imported state. */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { rename, writeFile } from "node:fs/promises";
import { importFixture } from "../helpers/store/import-fixture.js";

describe("import publication", () => {
  it("publishes every landed ref through the designated state remote without moving code", async () => {
    const h = await importFixture();
    const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    const result = await h.migrate();
    expect(result.status, JSON.stringify(result)).toBe("ok");
    if (result.status !== "ok") throw new Error("Import refused");
    const remote = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    const local = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    const state = (lines: string) => lines.split("\n").filter((line) => line && !line.startsWith("refs/arc/tmp/")).sort();
    expect(state(remote).map((line) => line.split(" ")[0])).toEqual(result.result.refs.map(({ ref }) => ref).sort());
    expect(state(remote)).toEqual(state(local));
    expect((await h.git("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(head);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/heads/"])).stdout).toBe("");
  });
  it("publishes project-only state when no personal identity is configured", async () => {
    const h = await importFixture();
    await h.git("git", ["config", "--unset", "arc.identity"]);
    h.ports.identity = async () => null;
    const result = await h.migrate();
    expect(result.status, JSON.stringify(result)).toBe("ok");
    const remote = (await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.split("\n").filter(Boolean);
    expect(remote).toHaveLength(4);
    expect(remote.some((ref) => ref.startsWith("refs/arc/user/"))).toBe(false);
  });
  it("keeps a failed publication's landing and resumes it after the remote is restored", async () => {
    const h = await importFixture();
    await rename(h.origin, `${h.origin}.offline`);
    const refused = await h.migrate();
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
      code: "unreachable", remedy: { text: expect.stringContaining("arc store migrate --import") },
    } } });
    const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/work/", "refs/arc/cohort/", "refs/arc/project/"])).stdout;
    expect(before.split("\n").filter(Boolean)).toHaveLength(4);
    await rename(`${h.origin}.offline`, h.origin);
    await writeFile(join(h.root, ".arc/active/meta-alpha.md"), "broken after the landing");
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/work/", "refs/arc/cohort/", "refs/arc/project/"])).stdout).toBe(before);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
  });
  it("resumes after publication itself completed without rereading the source or minting owners", async () => {
    const h = await importFixture();
    const original = h.ports.exec;
    let interrupted = false;
    h.ports.exec = async (...args) => {
      const result = await original(...args);
      if (!interrupted && args[1].includes("push")) { interrupted = true; throw new Error("interrupt-after-publish"); }
      return result;
    };
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "unreachable" } } });
    const before = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    expect(before.split("\n").filter(Boolean)).toHaveLength(4);
    h.ports.exec = original;
    await writeFile(join(h.root, ".arc/active/meta-alpha.md"), "broken after publication");
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
    const local = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/work/", "refs/arc/cohort/", "refs/arc/project/"])).stdout;
    expect(local).toBe(before);
  });
});

describe.each(["default", "separate"] as const)("interrupted import in %s", (layout) => {
  it.each(["build", "land", "publish"])("resumes an interruption before %s without duplicating owners", async (step) => {
    const h = await importFixture(layout);
    h.ports.migrateStep = async (observed) => { if (observed === `import.${step}`) throw new Error(`interrupt-${step}`); };
    await expect(h.migrate()).rejects.toThrow(`interrupt-${step}`);
    const scope = layout === "separate" && step !== "build" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    const read = async (prefix: string) => (await h.git("git", [...scope, "for-each-ref", "--format=%(refname) %(objectname)", prefix])).stdout.split("\n").filter(Boolean).sort();
    const before = (await read("refs/arc/")).filter((line) => !line.startsWith("refs/arc/tmp/"));
    if (step === "land") {
      expect(before).toEqual([]);
      expect((await read("refs/arc/tmp/migrate/import/")).length).toBeGreaterThan(0);
      if (layout === "separate") expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/import/"])).stdout).toBe("");
    }
    if (step === "publish") expect(before).toHaveLength(4);
    h.ports.migrateStep = async () => {};
    const result = await h.migrate();
    expect(result.status, JSON.stringify(result)).toBe("ok");
    const finalScope = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    const final = (await h.git("git", [...finalScope, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout.split("\n").filter((line) => line && !line.startsWith("refs/arc/tmp/")).sort();
    expect(final).toHaveLength(4);
    if (before.length) expect(final).toEqual(before);
    expect((await h.git("git", [...finalScope, "for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/import/"])).stdout).toBe("");
    const remote = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout.split("\n").filter(Boolean).sort();
    expect(remote).toEqual(layout === "default" ? final : []);
  });
});

describe.each(["default", "separate"] as const)("import landing in %s", (layout) => {
  it("lands none of its other refs when one destination's absence lease loses a race", async () => {
    const h = await importFixture(layout);
    const original = h.ports.execInput;
    let injected: string | undefined;
    h.ports.execInput = async (args, input, options) => {
      const row = /^create (refs\/arc\/cohort\/[0-9a-f-]{36}) ([0-9a-f]+)$/mu.exec(input);
      if (args.includes("update-ref") && row?.[1] && row[2] && !injected) {
        injected = row[1];
        const gitDir = args.find((arg) => arg.startsWith("--git-dir="));
        await h.git("git", [...gitDir ? [gitDir] : [], "update-ref", row[1], row[2]]);
      }
      return original(args, input, options);
    };
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
      code: "version-conflict", records: expect.arrayContaining([expect.objectContaining({ kind: "cohort/document" })]),
      remedy: { text: expect.stringMatching(/clone.*(?:empty|no state)/u) },
    } } });
    expect(injected).toMatch(/^refs\/arc\/cohort\//u);
    const scope = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    const state = (await h.git("git", [...scope, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.split("\n").filter((line) => line && !line.startsWith("refs/arc/tmp/"));
    expect(state).toEqual([injected]);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  });

  it("uses one landing batch across every ref with import provenance", async () => {
    const h = await importFixture(layout);
    const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    const result = await h.migrate();
    expect(result.status, JSON.stringify(result)).toBe("ok");
    if (result.status !== "ok") throw new Error("Import refused");
    const scope = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    const batches: string[] = [];
    for (const { ref } of result.result.refs) {
      const message = (await h.git("git", [...scope, "show", "-s", "--format=%B", ref])).stdout;
      expect(message).toMatch(/^migrate /u);
      expect(message).toContain("Arc-Lifecycle-Action: import");
      expect(message).toContain(`Arc-Code-Head: ${head}`);
      batches.push(/^Arc-Batch: (.+)$/mu.exec(message)?.[1] ?? "missing");
    }
    expect(batches.length).toBe(4);
    expect(new Set(batches).size).toBe(1);
    expect(batches[0]).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("lands exactly the trial's ref multiset with minted UIDs masked", async () => {
    const h = await importFixture(layout);
    const trial = await h.migrate(true), landed = await h.migrate();
    expect(trial.status, JSON.stringify(trial)).toBe("ok");
    expect(landed.status, JSON.stringify(landed)).toBe("ok");
    if (trial.status !== "ok" || landed.status !== "ok") throw new Error("Import refused");
    const normalize = (rows: typeof trial.result.refs) => rows.map((row) => JSON.stringify({ ...row,
      ref: row.ref.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gu, "<uid>"),
    })).sort();
    expect(normalize(landed.result.refs)).toEqual(normalize(trial.result.refs));
    const scope = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    const refs = (await h.git("git", [...scope, "for-each-ref", "--format=%(refname)", "refs/arc/work/", "refs/arc/cohort/", "refs/arc/project/"])).stdout.split("\n").filter(Boolean).sort();
    expect(refs).toEqual(landed.result.refs.map(({ ref }) => ref).sort());
  });
});
