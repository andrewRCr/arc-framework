/**
 * Link a checkout's canonical ARC skills into its harness skill folders.
 *
 * Usage: node scripts/link-skills.mjs [checkout...]   (default: the checkout holding this script)
 *
 * Each skill under `.arc/system/.internal/skills/` gets a link at `<harness>/skills/<name>`, for every harness folder
 * the checkout already has, so the harness reads the current skill text. A missing skill is linked; a copied skill
 * folder holding only generated files, or a link that resolves elsewhere, is replaced; a folder holding anything else
 * is left and named on stderr.
 */
import { lstat, mkdir, readdir, realpath, rm, symlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESSES = [".claude", ".codex"];
const CANONICAL = join(".arc", "system", ".internal", "skills");
const GENERATED = new Set(["SKILL.md", "agents", join("agents", "openai.yaml")]);

async function stat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function canonicalSkills(root) {
  const directory = join(root, CANONICAL);
  if ((await stat(directory)) === null) throw new Error(`${root} has no canonical skills at ${CANONICAL}`);
  const names = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && (await stat(join(directory, entry.name, "SKILL.md"))) !== null) names.push(entry.name);
  }
  return names.sort();
}

async function resolvesTo(path, target) {
  try {
    return (await realpath(path)) === (await realpath(target));
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

/** Link one skill, returning what changed, or `null` when the link was already current. */
async function linkSkill(root, harness, name) {
  const path = join(root, harness, "skills", name);
  const source = join(root, CANONICAL, name);
  const shown = relative(root, path);
  const existing = await stat(path);
  if (existing?.isSymbolicLink() && (await resolvesTo(path, source))) return null;
  if (existing !== null && !existing.isSymbolicLink()) {
    const files = existing.isDirectory() ? await readdir(path, { recursive: true }) : [];
    if (!existing.isDirectory() || !files.every((file) => GENERATED.has(file))) {
      return { left: `left ${shown}: it holds files skill generation does not write; move it aside and rerun` };
    }
  }
  if (existing !== null) await rm(path, { recursive: true, force: true });
  // Windows gets a junction, which needs no privilege and takes an absolute target; elsewhere the link stays relative.
  if (process.platform === "win32") await symlink(source, path, "junction");
  else await symlink(relative(dirname(path), source), path, "dir");
  return { changed: existing === null ? `linked ${shown}` : `replaced ${shown} with a link` };
}

const scriptCheckout = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const roots = process.argv.length > 2 ? process.argv.slice(2).map((path) => resolve(path)) : [scriptCheckout];
for (const root of roots) {
  const names = await canonicalSkills(root);
  const prefix = roots.length > 1 ? `${root}: ` : "";
  for (const harness of HARNESSES) {
    if ((await stat(join(root, harness))) === null) continue;
    await mkdir(join(root, harness, "skills"), { recursive: true });
    for (const name of names) {
      const result = await linkSkill(root, harness, name);
      if (result?.changed) console.log(`${prefix}${result.changed}`);
      if (result?.left) console.error(`${prefix}${result.left}`);
    }
  }
}
