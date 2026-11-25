/** Transient import consumes every captured identity tip, preserving failed acquisitions and retirement leases. */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importFixture } from "../helpers/store/import-fixture.js";
import { ordinaryErrand, seedTransients, transientCommon, transientSourceRef, keptPrefix } from "../helpers/store/import-transients.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { createRefStore } from "../../src/lib/store/index.js";
import { success } from "../helpers/store/suite-tools.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";

type Fixture = Awaited<ReturnType<typeof importFixture>>;

function ordinaryRecord() {
  if (ordinaryErrand.kind !== "errand" || ordinaryErrand.purpose !== "errand") throw new Error("Expected an ordinary Errand fixture");
  return ordinaryErrand;
}

async function imported(h: Fixture) {
  const work = success(await createRefStore(h.ports).list({ family: "work-item", kind: "work-item/record" }));
  expect(work.status).toBe("complete");
  if (work.status !== "complete") throw new Error("Incomplete imported work");
  return work.records.map(({ reference, content }) => ({ name: reference.owner.name, ...JSON.parse(content) as { owner: string; intent: string } }));
}

async function noLanding(h: Fixture, layout: "default" | "separate") {
  const directory = join(h.root, ".git/arc/store");
  const scope = layout === "separate" && await h.ports.fs.lstat(directory).then(() => true, () => false) ? [`--git-dir=${directory}`] : [];
  expect((await h.git("git", [...scope, "for-each-ref", "--format=%(refname)", "refs/arc/work/", "refs/arc/project/", "refs/arc/cohort/"])).stdout).toBe("");
}

describe.each(["default", "separate"] as const)("captured transient import in %s", layout => {
  it("imports every held identity despite a signaled named-ref presence probe", async () => {
    const h = await importFixture(layout);
    await seedTransients(h, [ordinaryErrand]);
    const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    await seedTransients(h, [{ ...ordinaryRecord(), slug: "alex-errand", branch: "chore/alex-errand", intent: "Other identity intent" },
      { ...transientCommon, kind: "groom", slug: "groom-beta", anchorStub: "beta", members: ["beta"], openedBaseHead: head,
        protection: "partial", branch: null, state: "open", changeRequest: null }], "alex");
    const exec = h.ports.exec;
    h.ports.exec = async (command, args, options) => {
      if (args.includes("show-ref") && args.includes("--exists") && args.at(-1) === "refs/arc/user/alex/errands") {
        throw makeGitProcessError({ command, args, exitCode: 2, signal: "SIGTERM" });
      }
      return exec(command, args, options);
    };
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    expect(await imported(h)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "example", owner: "andrew", intent: "Keep this intent" }),
      expect.objectContaining({ name: "alex-errand", owner: "alex", intent: "Other identity intent" }),
    ]));
    const claims = success(await createRefStore({ ...h.ports, identity: async () => SlugSchema.parse("alex") })
      .list({ family: "claims", kind: "claims/groom" }));
    expect(claims).toMatchObject({ status: "complete", records: expect.arrayContaining([
      expect.objectContaining({ reference: expect.objectContaining({ owner: expect.objectContaining({ name: "alex" }) }) }),
    ]) });
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", transientSourceRef, "refs/arc/user/alex/errands", keptPrefix])).stdout).toBe("");
  }, 60_000);

  it("preserves a signaled inventory failure and imports all source state after retry", async () => {
    const h = await importFixture(layout);
    const tip = await seedTransients(h, [ordinaryErrand]);
    const exec = h.ports.exec;
    let broken = true, failure: Error | undefined;
    h.ports.exec = async (command, args, options) => {
      if (broken && args.includes("for-each-ref") && args.at(-1) === "refs/arc/user/") {
        failure = makeGitProcessError({ command, args, exitCode: 2, signal: "SIGTERM" });
        throw failure;
      }
      return exec(command, args, options);
    };
    const observed: unknown = await h.migrate().then(() => undefined, (error: unknown) => error);
    expect(failure).toBeDefined();
    expect(observed).toBe(failure);
    await noLanding(h, layout);
    expect((await h.git("git", ["rev-parse", transientSourceRef])).stdout.trim()).toBe(tip);
    broken = false;
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    expect(await imported(h)).toContainEqual(expect.objectContaining({ name: "example", intent: "Keep this intent" }));
  }, 60_000);

  it.each(["tip", "tree", "blob"] as const)("blocks a signaled %s acquisition without landing and retries the same source", async stage => {
    const h = await importFixture(layout);
    const tip = await seedTransients(h, [ordinaryErrand]);
    const exec = h.ports.exec;
    let broken = true, inventoried = false;
    h.ports.exec = async (command, args, options) => {
      const targeted = stage === "tip" ? args.includes("rev-parse") && [tip + "^{commit}", transientSourceRef + "^{commit}"].includes(args.at(-1) ?? "")
        : stage === "tree" ? args.includes("ls-tree") && args.at(-1) === tip
          : args.includes("cat-file") && args.includes("blob");
      if (broken && inventoried && targeted) throw makeGitProcessError({ command, args, exitCode: 2, signal: "SIGTERM" });
      const result = await exec(command, args, options);
      if (args.includes("for-each-ref") && args.at(-1) === "refs/arc/user/") inventoried = true;
      return result;
    };
    expect(await h.migrate(true)).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
      expect.objectContaining({ condition: expect.any(String), remedy: expect.any(Object) }),
    ]) } });
    inventoried = false;
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
    await noLanding(h, layout);
    expect((await h.git("git", ["rev-parse", transientSourceRef])).stdout.trim()).toBe(tip);
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix])).stdout).toBe("");
    broken = false;
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    expect(await imported(h)).toContainEqual(expect.objectContaining({ name: "example", intent: "Keep this intent" }));
  }, 60_000);

  it.each(["removed", "changed"] as const)("keeps the inventoried content and retirement lease when the named ref is %s", async mutation => {
    const h = await importFixture(layout);
    const tip = await seedTransients(h, [ordinaryErrand]);
    await h.git("git", ["branch", "-D", "chore/example"]);
    await h.git("git", ["update-ref", "-d", transientSourceRef, tip]);
    const newer = await seedTransients(h, [{ ...ordinaryRecord(), intent: "Changed after capture" }]);
    await h.git("git", ["update-ref", transientSourceRef, tip, newer]);
    const exec = h.ports.exec;
    let armed = true;
    h.ports.exec = async (command, args, options) => {
      const result = await exec(command, args, options);
      if (armed && args.includes("for-each-ref") && args.at(-1) === "refs/arc/user/") {
        armed = false;
        await h.git("git", mutation === "removed" ? ["update-ref", "-d", transientSourceRef, tip] : ["update-ref", transientSourceRef, newer, tip]);
      }
      return result;
    };
    const result = await h.migrate();
    if (layout === "default" || mutation === "changed") expect(result).toMatchObject({ status: "refused" });
    else expect(result).toMatchObject({ status: "ok" });
    if (layout === "default") await noLanding(h, layout);
    else expect(await imported(h)).toContainEqual(expect.objectContaining({ name: "example", intent: "Keep this intent" }));
    if (mutation === "changed") expect((await h.git("git", ["rev-parse", transientSourceRef])).stdout.trim()).toBe(newer);
    if (result.status === "refused") {
      expect((await h.git("git", ["for-each-ref", "--format=%(objectname)", keptPrefix])).stdout.trim()).toBe(tip);
      await h.git("git", ["update-ref", transientSourceRef, tip]);
      expect(await h.migrate()).toMatchObject({ status: "ok" });
    }
    expect(await imported(h)).toContainEqual(expect.objectContaining({ name: "example", intent: "Keep this intent" }));
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", transientSourceRef, keptPrefix])).stdout).toBe("");
  }, 60_000);
});
