/** Integration coverage for reusable prepared-repository fixtures. */

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  DEFAULT_PROMPTS,
  execFileAsync,
  initInTempRepo,
  join,
  readFile,
  writeFile,
} from "../helpers/integration.js";
import {
  copyPreparedRepository,
  prepareRepositoryTemplate,
  type PreparedRepositoryShape,
} from "../helpers/prepared-repository.js";

const plainShape: PreparedRepositoryShape = { kind: "plain", key: "default-init" };
const roots = new Set<string>();

async function buildPlainRepository(): Promise<string> {
  const root = await initInTempRepo(DEFAULT_PROMPTS, "test-user");
  roots.add(root);
  return root;
}

async function trackedTree(root: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--stage", "--others", "--exclude-standard"],
    { cwd: root },
  );
  return stdout;
}

afterEach(async () => {
  await Promise.all([...roots].map(async (root) => cleanupTempDir(root)));
  roots.clear();
});

describe("prepared repository fixtures", () => {
  it("copies the same tracked tree as a freshly built fixture", async () => {
    const template = await prepareRepositoryTemplate(plainShape, buildPlainRepository);
    const copy = await copyPreparedRepository(template, plainShape);
    roots.add(copy);
    const fresh = await buildPlainRepository();

    expect(copy).not.toBe(template.root);
    expect(await trackedTree(copy)).toBe(await trackedTree(fresh));
  });

  it("keeps concurrent copies independent under writes", async () => {
    const template = await prepareRepositoryTemplate(plainShape, buildPlainRepository);
    const [left, right] = await Promise.all([
      copyPreparedRepository(template, plainShape),
      copyPreparedRepository(template, plainShape),
    ]);
    roots.add(left);
    roots.add(right);

    await Promise.all([
      writeFile(join(left, "copy-marker"), "left", "utf8"),
      writeFile(join(right, "copy-marker"), "right", "utf8"),
    ]);

    expect(await readFile(join(left, "copy-marker"), "utf8")).toBe("left");
    expect(await readFile(join(right, "copy-marker"), "utf8")).toBe("right");
  });

  it("refuses to serve a fixture requested as a different shape", async () => {
    const template = await prepareRepositoryTemplate(plainShape, buildPlainRepository);
    const attempt = copyPreparedRepository(template, {
      kind: "remote-bearing",
      key: "default-init-with-origin",
    }).then((root) => {
      roots.add(root);
      return root;
    });

    await expect(attempt).rejects.toThrow(/shape/u);
  });
});
