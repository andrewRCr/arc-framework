/** Native Git ref locks preserve refused operations and expose a usable repair route. */
import { chmod, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { importFixture } from "../helpers/store/import-fixture.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";

const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "locked.md" });
const state = "refs/arc/user/andrew/personal";

beforeEach(() => { vi.stubEnv("FORCE_COLOR", undefined); });
afterEach(() => { vi.unstubAllEnvs(); });

it.each(["files", "reftable"] as const)("reports a stale native %s write lock and retries after its repair", async format => {
  const h = await createRefReadFixture(format), clock = createRefClock(new Date("2026-01-01T00:00:00Z"), 0);
  success(await h.store.write({ action: "put", reference, expected: null, content: "Before.\n", provenance: testProvenance }));
  const before = success(await h.store.read({ reference }));
  const lock = join(h.root, ".git", format === "files" ? `${state}.lock` : "reftable/tables.list.lock");
  await mkdir(dirname(lock), { recursive: true });
  await writeFile(lock, "Retained native lock.\n");
  const then = new Date(clock.at().getTime() - 300_000);
  await utimes(lock, then, then);
  const store = createRefStore({ ...h.ports, ...clock, execInput: (args, input, options) => h.ports.execInput(args.map(arg =>
    arg.replace(/^(reftable\.lockTimeout|core\.filesRefLockTimeout)=5000$/u, "$1=0")), input, options) });
  const mutation = { action: "put" as const, reference, expected: before.version, content: "After.\n", provenance: testProvenance };
  expect(await store.write(mutation)).toMatchObject({ status: "refused", refusal: { code: "lock-held", class: "recoverable", lock,
    condition: expect.stringContaining("300000ms"), remedy: { text: expect.stringMatching(/remove.*no Git process/iu) } } });
  expect(await readFile(lock, "utf8")).toBe("Retained native lock.\n");
  expect(success(await h.store.read({ reference })).content).toBe("Before.\n");
  await rm(lock);
  success(await store.write(mutation));
  expect(success(await store.read({ reference })).content).toBe("After.\n");
}, 20_000);

it("preserves a failed ref read-back whose expected values could not be established", async () => {
  const h = await createRefReadFixture("files");
  success(await h.store.write({ action: "put", reference, expected: null, content: "Before.\n", provenance: testProvenance }));
  const before = success(await h.store.read({ reference }));
  const lock = join(h.root, ".git", `${state}.lock`), packed = join(h.root, ".git", "packed-refs");
  const saved = await readFile(packed, "utf8").catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  await writeFile(lock, "Held before the observation failed.\n");
  let corrupted = false;
  const store = createRefStore({ ...h.ports, execInput: async (args, input, options) => {
    try {
      return await h.ports.execInput(args.map(arg => arg.replace(/^(reftable\.lockTimeout|core\.filesRefLockTimeout)=5000$/u, "$1=0")), input, options);
    } catch (error) {
      if (!corrupted && args.includes("update-ref")) { corrupted = true; await writeFile(packed, "Invalid packed ref entry\n"); }
      throw error;
    }
  } });
  const mutation = { action: "put" as const, reference, expected: before.version, content: "After.\n", provenance: testProvenance };
  try {
    const result: unknown = await store.write(mutation).catch(error => error);
    expect(corrupted).toBe(true);
    expect(result).toMatchObject({ kind: "nonzero-exit", args: expect.arrayContaining(["for-each-ref"]),
      cause: expect.objectContaining({ kind: "nonzero-exit", args: expect.arrayContaining(["update-ref"]) }) });
    expect(await readFile(lock, "utf8")).toBe("Held before the observation failed.\n");
  } finally {
    if (saved === undefined) await rm(packed, { force: true }); else await writeFile(packed, saved);
    await rm(lock);
  }
  expect(success(await h.store.read({ reference })).content).toBe("Before.\n");
  success(await store.write(mutation));
  expect(success(await store.read({ reference })).content).toBe("After.\n");
}, 20_000);

it("keeps a canceled transaction read-back canceled even beside a native lock", async () => {
  const h = await createRefReadFixture("files");
  success(await h.store.write({ action: "put", reference, expected: null, content: "Before.\n", provenance: testProvenance }));
  const before = success(await h.store.read({ reference })), lock = join(h.root, ".git", `${state}.lock`);
  await writeFile(lock, "Retained while read-back cancels.\n");
  const controller = new AbortController(); controller.abort();
  let failedUpdate = false;
  const store = createRefStore({ ...h.ports, execInput: async (args, input, options) => {
    if (failedUpdate && args.includes("for-each-ref")) return h.ports.execInput(args, input, { ...options, signal: controller.signal });
    try {
      return await h.ports.execInput(args.map(arg => arg.replace(/^(reftable\.lockTimeout|core\.filesRefLockTimeout)=5000$/u, "$1=0")), input, options);
    } catch (error) { if (args.includes("update-ref")) failedUpdate = true; throw error; }
  } });
  const mutation = { action: "put" as const, reference, expected: before.version, content: "After.\n", provenance: testProvenance };
  const result: unknown = await store.write(mutation).catch(error => error);
  expect(failedUpdate).toBe(true);
  expect(result).toMatchObject({ kind: "canceled", isCanceled: true, cause: expect.objectContaining({ kind: "nonzero-exit" }) });
  expect(await readFile(lock, "utf8")).toBe("Retained while read-back cancels.\n");
  expect(success(await h.store.read({ reference })).content).toBe("Before.\n");
  await rm(lock);
  success(await store.write(mutation));
  expect(success(await store.read({ reference })).content).toBe("After.\n");
}, 20_000);

it("preserves an unrelated completed failure with and without a stale packed lock", async () => {
  const h = await createRefReadFixture("files");
  success(await h.store.write({ action: "put", reference, expected: null, content: "Before.\n", provenance: testProvenance }));
  const before = success(await h.store.read({ reference }));
  const hook = join(h.root, ".git", "hooks", "reference-transaction"), lock = join(h.root, ".git", "packed-refs.lock");
  await writeFile(hook, '#!/bin/sh\nif [ "$1" = prepared ]; then echo "Hook refused the update" >&2; exit 1; fi\n');
  await chmod(hook, 0o755);
  let original: unknown;
  const store = createRefStore({ ...h.ports, execInput: async (args, input, options) => {
    try { return await h.ports.execInput(args, input, options); }
    catch (error) { if (args.includes("update-ref")) original = error; throw error; }
  } });
  const mutation = { action: "put" as const, reference, expected: before.version, content: "After.\n", provenance: testProvenance };
  for (const packed of [true, false]) {
    if (packed) { await writeFile(lock, "Unrelated stale packed lock.\n"); await utimes(lock, new Date(0), new Date(0)); }
    else await rm(lock);
    const result: unknown = await store.write(mutation).catch(error => error);
    expect(result).toBe(original);
    expect(result).toMatchObject({ kind: "nonzero-exit", stderr: expect.stringContaining("Hook refused the update") });
    expect(success(await h.store.read({ reference })).content).toBe("Before.\n");
    if (packed) expect(await readFile(lock, "utf8")).toBe("Unrelated stale packed lock.\n");
  }
  await writeFile(hook, "#!/bin/sh\nexit 0\n");
  success(await store.write(mutation));
  expect(success(await store.read({ reference })).content).toBe("After.\n");
}, 20_000);

it("reports an import landing lock through its command boundary and retries after repair", async () => {
  const h = await importFixture("default", { refFormat: "files" });
  const clock = createRefClock(new Date("2026-01-01T00:00:00Z"), 0), original = h.ports.execInput;
  const lock = join(h.root, ".git", "refs/arc/project/registry.lock");
  h.ports.clock = clock.clock;
  let armed = true;
  h.ports.execInput = async (args, input, options) => {
    if (armed && args.includes("update-ref") && /^create refs\/arc\/project\/registry /mu.test(input)) {
      armed = false;
      await mkdir(dirname(lock), { recursive: true }); await writeFile(lock, "Retained import lock.\n");
      const then = new Date(clock.at().getTime() - 300_000);
      await utimes(lock, then, then);
    }
    return original(args.map(arg => arg.replace(/^(reftable\.lockTimeout|core\.filesRefLockTimeout)=5000$/u, "$1=0")), input, options);
  };
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
    code: "lock-held", class: "recoverable", lock, condition: expect.stringContaining("300000ms"),
    remedy: { text: expect.stringMatching(/remove.*no Git process/iu) },
  } } });
  expect(armed).toBe(false);
  expect(await readFile(lock, "utf8")).toBe("Retained import lock.\n");
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toBe("");
  await rm(lock);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const args = ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/work/"];
  const local = (await h.git("git", args)).stdout;
  expect(local).not.toBe("");
  expect((await h.remote("git", args)).stdout).toBe(local);
}, 40_000);

it("names a packed-ref deletion lock in the keeper path and retries after repair", async () => {
  const h = await createRefReadFixture("files"), clock = createRefClock(new Date("2026-01-01T00:00:00Z"), 0);
  success(await h.store.write({ action: "put", reference, expected: null, content: "Kept.\n", provenance: testProvenance }));
  success(await h.store.push());
  const tip = (await h.exec("git", ["rev-parse", state])).stdout.trim();
  const keeper = "refs/arc/tmp/seen/origin/user/andrew/personal", lock = join(h.root, ".git", "packed-refs.lock");
  await h.exec("git", ["update-ref", keeper, tip]);
  let armed = true;
  const store = createRefStore({ ...h.ports, ...clock, execInput: async (args, input, options) => {
    if (armed && args.includes("update-ref") && input.includes(`delete ${keeper} `)) {
      armed = false;
      await h.exec("git", ["pack-refs", "--all", "--prune"]);
      expect(await readFile(join(h.root, ".git", "packed-refs"), "utf8")).toContain(`${tip} ${keeper}`);
      await writeFile(lock, "Retained packed-ref lock.\n");
      const then = new Date(clock.at().getTime() - 300_000);
      await utimes(lock, then, then);
    }
    const at = args.indexOf("update-ref");
    return h.ports.execInput(at < 0 ? args : [...args.slice(0, at), "-c", "core.packedRefsTimeout=0", ...args.slice(at)], input, options);
  } });
  expect(await store.pull()).toMatchObject({ status: "refused", refusal: { code: "lock-held", class: "recoverable", lock,
    condition: expect.stringContaining("300000ms"), remedy: { text: expect.stringMatching(/remove.*no Git process/iu) } } });
  expect(armed).toBe(false);
  expect(await readFile(lock, "utf8")).toBe("Retained packed-ref lock.\n");
  expect((await h.exec("git", ["rev-parse", keeper])).stdout.trim()).toBe(tip);
  await rm(lock);
  success(await store.pull());
  expect((await h.exec("git", ["for-each-ref", "--format=%(refname)", keeper])).stdout).toBe("");
  expect(success(await store.read({ reference })).content).toBe("Kept.\n");
}, 20_000);

it.each(["default", "separate"] as const)("preserves lock age through a deadline-bound %s pull and retries after repair", async layout => {
  const h = await refSyncFixture(layout), clock = createRefClock(new Date("2026-01-01T00:00:00Z"), 0);
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Incoming.\n", provenance: testProvenance }));
  success(await h.a.store.push());
  const lock = join(h.b.gitDir ?? join(h.b.root, ".git"), layout === "default" ? `${state}.lock` : "reftable/tables.list.lock");
  let armed = true;
  const store = createRefStore({ ...h.b.ports, ...clock, execInput: async (args, input, options) => {
    if (armed && args.includes("update-ref") && input.split("\n").some(line => /^(create|update) /u.test(line) && line.includes(` ${state} `))) {
      armed = false;
      await mkdir(dirname(lock), { recursive: true }); await writeFile(lock, "Retained pull lock.\n");
      const then = new Date(clock.at().getTime() - 300_000);
      await utimes(lock, then, then);
    }
    return h.b.ports.execInput(args.map(arg => arg.replace(/^(reftable\.lockTimeout|core\.filesRefLockTimeout)=5000$/u, "$1=0")), input, options);
  } });
  expect(await store.pull()).toMatchObject({ status: "refused", refusal: { code: "lock-held", class: "recoverable", lock,
    condition: expect.stringContaining("300000ms"), remedy: { text: expect.stringMatching(/remove.*no Git process/iu) } } });
  expect(armed).toBe(false);
  expect(await readFile(lock, "utf8")).toBe("Retained pull lock.\n");
  await rm(lock);
  success(await store.pull());
  expect(success(await store.read({ reference })).content).toBe("Incoming.\n");
}, 20_000);

it.each(["version", "list"] as const)("reports a held manifest lock from %s and succeeds after release", async operation => {
  const h = await createRefReadFixture(), clock = createRefClock(new Date("2026-01-01T00:00:00Z"), 0);
  success(await h.store.write({ action: "put", reference, expected: null, content: "Kept.\n", provenance: testProvenance }));
  await h.exec("git", ["update-ref", "-d", "refs/arc/tmp/version"]);
  const lock = join(h.root, ".git", "refs/arc/tmp/version.lock");
  await mkdir(dirname(lock), { recursive: true }); await writeFile(lock, "Held manifest lock.\n");
  await utimes(lock, clock.at(), clock.at());
  const store = createRefStore({ ...h.ports, ...clock, execInput: (args, input, options) => h.ports.execInput(args.map(arg =>
    arg.replace(/^(reftable\.lockTimeout|core\.filesRefLockTimeout)=5000$/u, "$1=0")), input, options) });
  const invoke = () => operation === "version" ? store.version() : store.list({ family: "personal" });
  expect(await invoke()).toMatchObject({ status: "refused", refusal: { code: "lock-held", class: "recoverable", lock,
    condition: expect.stringContaining("0ms"), remedy: { text: expect.stringMatching(/^Retry/iu) } } });
  expect(await readFile(lock, "utf8")).toBe("Held manifest lock.\n");
  await rm(lock);
  expect((await invoke()).status).toBe("ok");
  expect(success(await store.read({ reference })).content).toBe("Kept.\n");
}, 20_000);
