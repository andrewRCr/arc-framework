import { describe, expect, it } from "vitest";
import type { GitExec, RawGitExec } from "../../src/lib/git/exec.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";

const refusal = "fatal: Duplicated ref, and SHA1s don't match: refs/arc/work/12345678-1234-4234-8234-000000000000\n";
const tornListing = (args: readonly string[]) => makeGitProcessError({ command: "git", args, exitCode: 128, stderr: refusal });

// Refuse each selected listing a set number of times, as a concurrent files-format transaction can.
function refuseListings(selected: (args: readonly string[]) => string | null, times: number) {
  const refused = new Map<string, number>();
  const refuse = (args: readonly string[]) => {
    const name = selected(args);
    if (name === null || (refused.get(name) ?? 0) >= times) return;
    refused.set(name, (refused.get(name) ?? 0) + 1);
    throw tornListing(args);
  };
  return { refuse, refused: (name: string) => refused.get(name) ?? 0 };
}

const tipListing = (args: readonly string[]) => args.includes("for-each-ref") ? "tips" : null;

describe("state-ref listings Git refuses as torn", () => {
  it("serve version and a name-resolved read after a refused tip listing", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("work-item/meta"));
    for (const operation of ["version", "read"] as const) {
      const listings = refuseListings(tipListing, 1);
      const rawExec: RawGitExec = async (args, options) => { listings.refuse(args); return f.ports.rawExec(args, options); };
      const store = createRefStore({ ...f.ports, rawExec });
      if (operation === "version") success(await store.version());
      // A reference without a UID resolves its owner through the tip listing.
      else expect(success(await store.read({ reference: f.reference("work-item/meta") })).content).toBe(record.content);
      expect({ operation, refused: listings.refused("tips") }).toEqual({ operation, refused: 1 });
    }
  });

  it("rethrows Git's refusal once every attempt is refused", async () => {
    const f = await createRefFixture();
    await seed(f, f.reference("work-item/meta"));
    const listings = refuseListings(tipListing, Number.POSITIVE_INFINITY);
    const rawExec: RawGitExec = async (args, options) => { listings.refuse(args); return f.ports.rawExec(args, options); };
    await expect(createRefStore({ ...f.ports, rawExec }).version())
      .rejects.toMatchObject({ kind: "nonzero-exit", stderr: refusal });
    expect(listings.refused("tips")).toBe(3);
  });

  it("pulls after refused sync and negotiation listings", async () => {
    const f = await createRefFixture();
    await seed(f, f.reference("work-item/meta"));
    success(await f.store.push());
    const listings = refuseListings((args) => !args.includes("for-each-ref") ? null
      : args.includes("--format=%(refname)") ? "negotiation"
        : args.includes("--format=%(refname) %(objectname)") && !args.includes("--") ? "sync" : null, 1);
    const exec: GitExec = async (command, args, options) => { listings.refuse(args); return f.ports.exec(command, args, options); };
    success(await createRefStore({ ...f.ports, exec }).pull());
    expect({ negotiation: listings.refused("negotiation"), sync: listings.refused("sync") }).toEqual({ negotiation: 1, sync: 1 });
  });
});
