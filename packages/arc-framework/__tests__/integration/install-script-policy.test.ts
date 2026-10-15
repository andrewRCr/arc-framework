/** Exercise the repository's dependency-script policy through real npm entrypoints. */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, it } from "vitest";

const execute = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
let registryUrl: string;
const registry = createServer(async (request, response) => {
  request.resume();
  const name = packages.find(([candidate]) => request.url === `/${candidate}`)?.[0];
  if (name) {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ name, "dist-tags": { latest: "1.0.0" }, versions: {
      "1.0.0": { name, version: "1.0.0", scripts: { install: "node install.cjs" },
        dist: { tarball: `${registryUrl}/${name}/-/${name}-1.0.0.tgz` } },
    } }));
  } else if (request.url?.endsWith(".tgz")) {
    const filename = request.url.split("/").at(-1);
    if (!filename || !packages.some(([candidate]) => filename === `${candidate}-1.0.0.tgz`)) {
      response.writeHead(404).end();
      return;
    }
    response.end(await readFile(join(root, filename)));
  } else {
    response.setHeader("content-type", "application/json");
    response.end("{}");
  }
});
let root: string;
let environment: NodeJS.ProcessEnv;
const packages = [
  ["esbuild", ".esbuild-built"],
  ["lefthook", "lefthook.yml"],
  ["unreviewed-install-script", ".unreviewed-ran"],
] as const;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-install-policy-"));
  await Promise.all(["user.npmrc", "global.npmrc"].map((name) => writeFile(join(root, name), "")));
  await new Promise<void>((resolve) => registry.listen(0, "127.0.0.1", resolve));
  const address = registry.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP registry address");
  registryUrl = `http://127.0.0.1:${address.port}`;
  environment = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !/^npm_config_/iu.test(key) && key !== "FORCE_COLOR"));
  Object.assign(environment, {
    npm_config_userconfig: join(root, "user.npmrc"),
    npm_config_globalconfig: join(root, "global.npmrc"),
    npm_config_cache: join(root, "cache"),
    npm_config_registry: registryUrl,
    npm_config_update_notifier: "false",
  });
  for (const [name, marker] of packages) {
    const directory = join(root, name);
    await mkdir(directory);
    await writeFile(join(directory, "package.json"), JSON.stringify({
      name, version: "1.0.0", scripts: { install: "node install.cjs" },
    }));
    await writeFile(join(directory, "install.cjs"),
      `require("node:fs").writeFileSync(require("node:path").resolve(process.cwd(), "../..", ${JSON.stringify(marker)}), "ran");`);
    await execute(npm, ["pack", "--pack-destination", root, "--ignore-scripts"],
      { cwd: directory, env: environment });
  }
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) => registry.close((error) => error ? reject(error) : resolve()));
  await rm(root, { recursive: true, force: true });
});

it.each(["install", "ci", "audit fix"])(
  "%s keeps scripts disabled, then explicit setup runs only the approved dependency", async (command) => {
    const directory = join(root, command.replace(" ", "-"));
    await mkdir(join(directory, "scripts"), { recursive: true });
    const manifest = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>; allowScripts: Record<string, boolean>;
    };
    let config = "";
    try { config = await readFile(join(repositoryRoot, ".npmrc"), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await writeFile(join(directory, ".npmrc"), config);
    await writeFile(join(directory, "package.json"), JSON.stringify({
      name: "install-policy-fixture", private: true, version: "1.0.0",
      allowScripts: manifest.allowScripts,
      dependencies: Object.fromEntries(packages.map(([name]) => [name, "1.0.0"])),
      scripts: { ...manifest.scripts, prepare: "node prepare.cjs" },
    }));
    await writeFile(join(directory, "prepare.cjs"), 'require("node:fs").writeFileSync(".prepared", "ran");');
    await execute(npm, ["install", "--package-lock-only", "--ignore-scripts", "--no-audit"],
      { cwd: directory, env: environment });
    await execute(npm, [...command.split(" "), "--foreground-scripts", "--no-fund"],
      { cwd: directory, env: environment });
    for (const [name] of packages) {
      const installed = JSON.parse(
        await readFile(join(directory, "node_modules", name, "package.json"), "utf8"),
      ) as { name: string };
      expect(installed.name).toBe(name);
    }
    const absent = async (name: string): Promise<void> => {
      await expect(readFile(join(directory, name), "utf8"), name).rejects.toMatchObject({ code: "ENOENT" });
    };
    await absent("lefthook.yml");
    await absent(".unreviewed-ran");
    await absent(".esbuild-built");
    await absent(".prepared");
    await writeFile(join(directory, "scripts/check-install-policy.mjs"),
      await readFile(join(repositoryRoot, "scripts/check-install-policy.mjs"), "utf8"));
    await execute(npm, ["run", "setup"], { cwd: directory, env: environment });
    expect(await readFile(join(directory, ".esbuild-built"), "utf8")).toBe("ran");
    expect(await readFile(join(directory, ".prepared"), "utf8")).toBe("ran");
    await absent("lefthook.yml");
    await absent(".unreviewed-ran");
  }, 30_000,
);
