/** Resolve personal links only after the selected notes snapshot establishes their saved paths. */
import { join } from "node:path";
import type { RefStorePorts } from "../../ports.js";
import type { MigrateReport } from "../../commands.js";
import { importPersonalExcluded, type ImportPersonalFile, type ImportPersonalLink } from "./personal-disk.js";

type ImportFileAccess = NonNullable<RefStorePorts["importSource"]>["ports"]["fs"];
interface LinkReader {
  fs: ImportFileAccess;
  snapshot: Readonly<Record<string, string>>;
  notices: MigrateReport["notices"];
  files: ImportPersonalFile[];
  skipped: Set<string>;
  visited: Map<string, Set<string>>;
}

/** Acquire saved links at their original manifest paths before ordinary notes comparison. */
export async function followImportPersonalLinks(fs: ImportFileAccess, links: readonly ImportPersonalLink[],
  snapshot: Readonly<Record<string, string>>, notices: MigrateReport["notices"],
  visited: ReadonlyMap<string, ReadonlySet<string>>): Promise<{ files: ImportPersonalFile[]; skipped: Set<string> }> {
  const reader: LinkReader = { fs, snapshot, notices, files: [], skipped: new Set(),
    visited: new Map([...new Set(links.map(link => link.root))].map(root => [root, new Set(visited.get(root))])) };
  for (const link of links) await followLink(reader, link);
  return { files: reader.files, skipped: reader.skipped };
}

async function followLink(reader: LinkReader, link: ImportPersonalLink): Promise<void> {
  const saved = Object.keys(reader.snapshot).filter(path => link.path === "" || path === link.path || path.startsWith(`${link.path}/`));
  if (!saved.length) { skipLink(reader, link, saved, "no selected notes path passes through it."); return; }
  try {
    const target = await reader.fs.realpath(link.physicalPath), stat = await reader.fs.lstat(target), collected: ImportPersonalFile[] = [];
    if (stat.isDirectory()) {
      if (!await collectLinkedDirectory({ ...reader, files: collected }, link, target)) {
        skipLink(reader, link, saved, "its real directory was already visited."); return;
      }
    } else if (stat.isFile()) collected.push({ ...link, size: stat.size, content: await reader.fs.readFile(link.physicalPath) });
    else throw new Error("The link target is neither a file nor a directory");
    reader.files.push(...collected);
    reader.notices.push({ condition: `Followed personal link ${link.person}/${link.path} at ${link.physicalPath}, which the notes snapshot saved.` });
  } catch (error) {
    skipLink(reader, link, saved, `cannot read its target: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function skipLink(reader: LinkReader, link: ImportPersonalLink, saved: readonly string[], reason: string): void {
  for (const path of saved) reader.skipped.add(path);
  reader.notices.push({ condition: `Skipped personal link ${link.person}/${link.path} at ${link.physicalPath}: ${reason}` });
}

async function collectLinkedDirectory(reader: LinkReader, link: ImportPersonalLink, target: string): Promise<boolean> {
  const visited = reader.visited.get(link.root) ?? new Set<string>();
  reader.visited.set(link.root, visited);
  if (visited.has(target)) return false;
  visited.add(target);
  for (const entry of await reader.fs.readdir(link.physicalPath)) {
    const child = { ...link, path: link.path ? `${link.path}/${entry.name}` : entry.name, physicalPath: join(link.physicalPath, entry.name) };
    if (importPersonalExcluded(child.path)) continue;
    const stat = await reader.fs.lstat(child.physicalPath);
    if (stat.isSymbolicLink()) await followLink(reader, child);
    else if (stat.isDirectory()) await collectLinkedDirectory(reader, child, await reader.fs.realpath(child.physicalPath));
    else if (stat.isFile()) reader.files.push({ ...child, size: stat.size, content: await reader.fs.readFile(child.physicalPath) });
  }
  return true;
}
