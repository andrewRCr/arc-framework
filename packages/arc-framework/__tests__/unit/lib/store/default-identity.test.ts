/** Explicit personal identity selection precedes configured identity reads. */
import { expect, it } from "vitest";
import { createDefaultStorePorts } from "../../../../src/lib/store/default-ports.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";

it("uses an explicitly selected identity before Git identity configuration", async () => {
  const ports = createDefaultStorePorts({ checkoutRoot: "/repo", identity: SlugSchema.parse("alice"),
    exec: async () => ({ stdout: "configured-person\0" }) });
  expect(await ports.identity()).toBe("alice");
});
it("retains configured identity resolution when none was supplied", async () => {
  const ports = createDefaultStorePorts({ checkoutRoot: "/repo", exec: async () => ({ stdout: "configured-person\0" }) });
  expect(await ports.identity()).toBe("configured-person");
});
