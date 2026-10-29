/** Terminal answers use the real remote command syntax and native store ports. */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { PromptRenderer } from "../../src/lib/command-input/prompter.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";

it.each([true, false, "cancelled"] as const)("applies only an affirmative terminal answer (%s)", async (answer) => {
  const h = await refSyncFixture();
  await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
  await mkdir(join(h.a.root, ".arc", "system"), { recursive: true });
  await writeFile(join(h.a.root, ".arc", "system", "arc-config.yml"), `storage.backing_repository: ${JSON.stringify(h.origin)}\n`);
  let displayed = "";
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected prompt form"); };
  const renderer: PromptRenderer = { text: unexpected, select: unexpected, multiselect: unexpected,
    confirm: async (_context, question) => {
      displayed += question.message;
      return answer === "cancelled" ? { kind: "cancelled" } : { kind: "answered", value: answer };
    } };
  const result = await invokeStoreRemote(["origin", "push"], { cwd: h.a.root, renderer });
  expect(result.result?.status, JSON.stringify(result)).toBe("ok");
  expect(result.exitCode).toBe(0);
  expect(displayed).toContain(h.origin);
  expect(displayed).toContain("everything");
  expect((await h.a.exec("git", ["config", "remote.origin.arc-state"])).stdout).toBe(answer === true ? "push" : "off");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
});
