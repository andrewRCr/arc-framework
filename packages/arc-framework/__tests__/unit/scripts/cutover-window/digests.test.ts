/** Personal fingerprints depend on acquired paths and contents, not filesystem enumeration order. */
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/schema/slug.js";
import { deriveWindowPersonalDigests } from "../../../../src/scripts/cutover-window/digests.js";

it("orders acquired personal files and links by path before fingerprinting", () => {
  const root = resolve("primary"), identityRoot = join(root, ".arc/user/andrew");
  const person = SlugSchema.parse("andrew");
  const files = ["z.md", "a.md"].map(path => ({ person, path, physicalPath: join(identityRoot, path),
    content: `Contents for ${path}`, size: Buffer.byteLength(`Contents for ${path}`) }));
  const links = ["nested/z", "nested/a"].map(path => ({ person, path, physicalPath: join(identityRoot, path), root: identityRoot }));
  expect(deriveWindowPersonalDigests({ files, links }, [{ path: root }]))
    .toEqual(deriveWindowPersonalDigests({ files: [...files].reverse(), links: [...links].reverse() }, [{ path: root }]));
});
