/** Git credential helper for a local manual-probe profile; credentials go only to Git's pipe. */
import { readFile, stat } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";

const [file, authority, operation] = process.argv.slice(2);
if (operation === "get") {
  if (file === undefined) throw new Error("Credential profile path is required");
  /** @type {string} */
  const input = await new Promise((resolve, reject) => {
    let content = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => { content += chunk; });
    process.stdin.on("end", () => resolve(content));
    process.stdin.on("error", reject);
  });
  const fields = new Map(input.split("\n").map(line => {
    const split = line.indexOf("=");
    return [line.slice(0, split), line.slice(split + 1)];
  }));
  if (fields.get("host") !== authority || !["https", "http"].includes(fields.get("protocol") ?? "")) process.exit(1);
  if ((await stat(file)).mode & 0o077) throw new Error("Credential profile must be private");
  const profile = JSON.parse(await readFile(file, "utf8"));
  const hostname = new URL(`${fields.get("protocol")}://${authority}`).hostname;
  if (profile.host !== hostname || !profile.token || /[\r\n]/u.test(profile.token)) throw new Error("Credential profile host/token mismatch");
  if (fields.get("protocol") === "http" && !["127.0.0.1", "localhost", "[::1]"].includes(hostname)) process.exit(1);
  if (profile.port && `${profile.host}:${profile.port}` !== authority) throw new Error("Credential profile port mismatch");
  const username = hostname === "bitbucket.org" ? "x-bitbucket-api-token-auth"
    : profile.expectedLogin ?? profile.login ?? "arc-host-kit";
  if (/[\r\n]/u.test(username)) throw new Error("Credential username is invalid");
  process.stdout.write(`username=${username}\npassword=${profile.token}\n\n`);
}
