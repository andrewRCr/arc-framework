/** Lazy file acquisition for host facts admitted only in a repository with local remote URLs. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseWindowPullRequests, type WindowPullRequests } from "./host.js";
import { WindowRefusal } from "./result.js";

/** Read a complete request listing relative to the explicitly named checkout. */
export async function readSuppliedWindowRequests(repo: string, path: string, flip: number): Promise<WindowPullRequests> {
  const absolute = resolve(repo, path);
  try { return parseWindowPullRequests(JSON.parse(await readFile(absolute, "utf8")), flip); }
  catch (error) {
    if (error instanceof WindowRefusal) throw error;
    throw new WindowRefusal([{ subject: absolute, condition: error instanceof Error ? error.message : String(error),
      remedy: "Supply a readable complete pull-request listing, then retry the operation." }]);
  }
}
