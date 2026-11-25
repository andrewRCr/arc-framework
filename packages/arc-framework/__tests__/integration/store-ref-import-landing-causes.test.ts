/** Import landing keeps destination arbitration ahead of cause-specific retry notices. */
import { mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { importFixture } from "../helpers/store/import-fixture.js";

const prefix = "refs/arc/tmp/migrate/import/";
const privateChanged = "The import's private refs changed while its landing was being committed.";

it.each(["layout mismatch", "gathering ref loss"] as const)("retains the private gathering retry for %s", async cause => {
  const h = await importFixture(), common = (await h.git("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"])).stdout.trim();
  const child = join(common, "arc/store"), role = (await h.git("git", ["config", "--get", "remote.origin.arc-state"])).stdout.trim();
  let injected = false;
  h.ports.migrateStep = async step => {
    if (step !== "import.land" || injected) return;
    injected = true;
    if (cause === "layout mismatch") {
      const format = (await h.git("git", ["rev-parse", "--show-object-format"])).stdout.trim();
      await mkdir(dirname(child), { recursive: true });
      await h.git("git", ["init", "--bare", "--ref-format=reftable", `--object-format=${format}`, child]);
      await h.git("git", ["config", "remote.origin.arc-state", "off"]);
    } else {
      const rows = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", prefix])).stdout;
      const [ref, tip] = (rows.split("\n").find(line => line && !line.startsWith(`${prefix}kept/`)) ?? "").split(" ");
      if (!ref || !tip) throw new Error("No native gathering ref was available");
      await h.git("git", ["update-ref", "-d", ref, tip]);
    }
  };
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused", class: "recoverable", report: {
    notices: expect.arrayContaining([expect.objectContaining({ condition: privateChanged,
      remedy: expect.objectContaining({ argv: ["arc", "store", "migrate", "--import"] }) })]),
  } } });
  expect(injected).toBe(true);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toBe("");
  h.ports.migrateStep = async () => {};
  if (cause === "layout mismatch") {
    expect((await h.git("git", [`--git-dir=${child}`, "for-each-ref", "--format=%(refname)"])).stdout).toBe("");
    await rename(child, `${child}-set-aside`);
    await h.git("git", ["config", "remote.origin.arc-state", role]);
  }
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).not.toBe("");
}, 40_000);

it("publishes an already committed matching landing after the transaction loses its leases", async () => {
  const h = await importFixture(), original = h.ports.execInput;
  let replayed = false;
  h.ports.execInput = async (args, input, options) => {
    if (!replayed && args.includes("update-ref") && /^create refs\/arc\/project\/registry /mu.test(input)) {
      replayed = true;
      await original(args, input, options);
    }
    return original(args, input, options);
  };
  const result = await h.migrate();
  expect(replayed).toBe(true);
  expect(result).toMatchObject({ status: "ok" });
  if (result.status !== "ok") throw new Error("The matching landing was not published");
  expect(result.result.notices.map(notice => notice.condition)).not.toContain(privateChanged);
  const args = ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/work/"];
  const local = (await h.git("git", args)).stdout;
  expect(local).not.toBe("");
  expect((await h.remote("git", args)).stdout).toBe(local);
}, 40_000);
