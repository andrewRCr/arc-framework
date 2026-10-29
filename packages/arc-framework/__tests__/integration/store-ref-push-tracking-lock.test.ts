/** Accepted receiver updates remain explicit when the local acknowledgment hits a native Git lock. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefTestRepository } from "../helpers/store/ref-plant.js";
import { createRefSyncCheckout } from "../helpers/store/ref-sync.js";
import { makeGitExec } from "../helpers/integration.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";

it.each([
  { layout: "default", format: "files" }, { layout: "default", format: "reftable" },
  { layout: "separate", format: "reftable" },
] as const)("reports accepted publication before a $layout $format acknowledgment lock and reconciles after release", async ({ layout, format }) => {
  const h = await createRefTestRepository(format); onTestFinished(h.cleanup);
  await h.exec("git", ["config", "arc.identity", "andrew"]);
  if (layout === "separate") await h.exec("git", ["config", "remote.origin.arc-state", "off"]);
  const checkout = await createRefSyncCheckout(h.root, layout, h.remote), ports = checkout.ports;
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "accepted.md", owner: { type: "person", name: "andrew" } });
  success(await checkout.store.write({ action: "put", reference, expected: null, content: "Receiver accepted state.\n",
    provenance: { verb: "edit", lifecycleAction: "save" } }));
  const home = expandStoredPath(reference), remoteName = layout === "default" ? "origin" : "backing";
  const tracking = home.ref.replace("refs/arc/", `refs/arc-remotes/${remoteName}/`);
  const directory = join(h.root, ".git", ...layout === "separate" ? ["arc", "store"] : []);
  const lock = join(directory, format === "files" ? `${tracking}.lock` : "reftable/tables.list.lock");
  const accepted = (await checkout.git(["rev-parse", home.ref])).stdout.trim();
  let locked = false;
  const store = createRefStore({ ...ports,
    execInput: (args, input, options) => ports.execInput(args.map(arg =>
      arg.replace(/^(reftable\.lockTimeout|core\.filesRefLockTimeout)=5000$/u, "$1=0")), input, options),
    exec: async (command, args, options) => {
      const result = await ports.exec(command, args, options);
      if (!locked && args.includes("push") && args.includes("--porcelain")) {
        locked = true; await mkdir(dirname(lock), { recursive: true }); await writeFile(lock, "Held after receiver acceptance\n");
      }
      return result;
    },
  });
  const remote = makeGitExec(h.remote);
  try {
    const result = await store.push();
    expect(locked).toBe(true);
    expect(result).toMatchObject({ status: "refused", refusal: { code: "lock-held", class: "recoverable", lock,
      condition: expect.stringMatching(/receiver accepted/iu), remedy: { text: expect.stringMatching(/retry|reconcil/iu) } } });
    if (result.status !== "refused") throw new Error("Expected a local acknowledgment lock refusal");
    expect(result.refusal.condition).toContain(home.ref);
    expect((await remote("git", ["rev-parse", home.ref])).stdout.trim()).toBe(accepted);
    expect((await remote("git", ["show", `${home.ref}:${home.path}`])).stdout).toBe("Receiver accepted state.");
    expect((await checkout.git(["for-each-ref", "--format=%(refname)", tracking])).stdout).toBe("");
  } finally { await rm(lock, { force: true }); }
  const retried = success(await store.push());
  expect(retried.publishes.every(outcome => outcome.status !== "failed"), JSON.stringify(retried)).toBe(true);
  expect((await checkout.git(["rev-parse", tracking])).stdout.trim()).toBe(accepted);
  expect((await remote("git", ["rev-parse", home.ref])).stdout.trim()).toBe(accepted);
  expect(success(await store.read({ reference })).content).toBe("Receiver accepted state.\n");
});

it("preserves an unrelated acknowledgment executor failure and reconciles the accepted update on retry", async () => {
  const h = await createRefTestRepository(); onTestFinished(h.cleanup);
  await h.exec("git", ["config", "arc.identity", "andrew"]);
  const checkout = await createRefSyncCheckout(h.root, "default", h.remote), ports = checkout.ports;
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "unrelated.md", owner: { type: "person", name: "andrew" } });
  success(await checkout.store.write({ action: "put", reference, expected: null, content: "Accepted before unrelated local failure.\n",
    provenance: { verb: "edit", lifecycleAction: "save" } }));
  const home = expandStoredPath(reference), tracking = home.ref.replace("refs/arc/", "refs/arc-remotes/origin/");
  const failure = makeGitProcessError({ command: "git", args: ["update-ref", "--stdin"], exitCode: 128,
    stderr: "An unrelated acknowledgment executor failed." });
  let published = false, interrupt = true;
  const store = createRefStore({ ...ports,
    exec: async (command, args, options) => {
      const result = await ports.exec(command, args, options);
      if (args.includes("push") && args.includes("--porcelain")) published = true;
      return result;
    },
    execInput: (args, input, options) => {
      if (published && interrupt && args.includes("update-ref") && input.includes(tracking)) throw failure;
      return ports.execInput(args, input, options);
    },
  });
  await expect(store.push()).rejects.toBe(failure);
  const remote = makeGitExec(h.remote), accepted = (await remote("git", ["rev-parse", home.ref])).stdout.trim();
  expect((await checkout.git(["for-each-ref", "--format=%(refname)", tracking])).stdout).toBe("");
  interrupt = false;
  expect(success(await store.push()).publishes.every(outcome => outcome.status !== "failed")).toBe(true);
  expect((await checkout.git(["rev-parse", tracking])).stdout.trim()).toBe(accepted);
  expect(success(await store.read({ reference })).content).toBe("Accepted before unrelated local failure.\n");
});
