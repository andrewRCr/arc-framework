/** The window's containment keeps a child whose name begins with two dots inside its parent. */
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { windowPathContains } from "../../../../src/scripts/cutover-window/paths.js";

it("keeps a child whose name starts with two dots inside its parent and leaves a sibling outside", async () => {
  const root = resolve("absent-window-checkout");
  await expect(windowPathContains(root, root)).resolves.toBe(true);
  await expect(windowPathContains(root, join(root, "..copy"))).resolves.toBe(true);
  await expect(windowPathContains(root, resolve(root, "..", "outside"))).resolves.toBe(false);
  await expect(windowPathContains(root, resolve(root, ".."))).resolves.toBe(false);
});
