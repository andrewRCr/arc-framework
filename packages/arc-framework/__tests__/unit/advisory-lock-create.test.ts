/**
 * Lockfile creation when the holder record lands late, as a starved write can on
 * an oversubscribed machine: a contender must never read that lock as abandoned,
 * and the store's exclusive create must never expose a file before its content.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { withAdvisoryLock } from "../../src/lib/advisory-lock.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";

const starved = vi.hoisted(() => ({ matches: ((): boolean => false) as (path: string) => boolean, delayMs: 250 }));

// An exclusive create of a starved path opens the file at once and writes its content only after the delay.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const writeFile: typeof actual.writeFile = async (path, data, options) => {
    const exclusive = typeof options === "object" && options !== null && options.flag === "wx";
    if (!exclusive || typeof path !== "string" || !starved.matches(path)) return actual.writeFile(path, data, options);
    const handle = await actual.open(path, "wx");
    try {
      await new Promise((resolve) => setTimeout(resolve, starved.delayMs));
      await handle.writeFile(data as string);
    } finally {
      await handle.close();
    }
  };
  return { ...actual, writeFile, default: { ...actual, writeFile } };
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Match a target and the staging copies an atomic create writes beside it. */
function starvedCreate(target: string): (path: string) => boolean {
  const staging = new RegExp(`^\\.${basename(target).replaceAll(".", "\\.")}\\.[0-9a-f]+\\.tmp$`, "u");
  return (path) => path === target || staging.test(basename(path));
}

describe("lockfile creation with a late holder record", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "arc-lock-create-"));
  });

  afterEach(async () => {
    starved.matches = () => false;
    await rm(dir, { recursive: true, force: true });
  });

  it("keeps a contender out while the first holder's record is still being written", async () => {
    const lockPath = join(dir, "state.lock");
    // The break-lock writes promptly, so a contender that misreads the lock can break it.
    starved.matches = starvedCreate(lockPath);
    // Without a read-back grace, a contender breaks any lockfile it sees before the record lands.
    const options = { sleep: async () => {} };
    let inside = 0;
    let most = 0;
    const critical = async () => {
      inside++;
      most = Math.max(most, inside);
      await sleep(starved.delayMs);
      inside--;
    };

    const first = withAdvisoryLock(lockPath, critical, options);
    await sleep(20);
    const second = withAdvisoryLock(lockPath, critical, options);
    await Promise.all([first, second]);

    expect(most).toBe(1);
  });

  it("publishes the store's exclusive create, such as its record lock, only with complete content", async () => {
    const target = join(dir, "record.json.lock");
    starved.matches = starvedCreate(target);
    const ports = createDefaultStorePorts({ checkoutRoot: dir });

    const created = ports.fs.exclusiveCreate(target, "complete");
    await sleep(starved.delayMs / 2);
    await expect(access(target)).rejects.toMatchObject({ code: "ENOENT" });
    await created;

    expect(await readFile(target, "utf8")).toBe("complete");
  });
});
