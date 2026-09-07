import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, lstatSync, constants } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import console from "node:console";

const source = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const target = mkdtempSync(path.join(tmpdir(), "riic-agent-closeout-"));
// Git's public file list includes current uncommitted and untracked source; never copy ignored data.
const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: source }).toString().split("\0").filter(Boolean);
const hashes = {};
for (const file of files) {
  if (file.split("/").some((part) => part.startsWith(".env") || /^(?:AGENTS(?:\.override)?\.md|\.npmrc|\.git|node_modules)$/.test(part))) continue;
  const from = path.join(source, file);
  if (!lstatSync(from).isFile()) throw new Error("Only regular public source files may enter the test copy.");
  mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
  cpSync(from, path.join(target, file), { mode: constants.COPYFILE_FICLONE });
  hashes[file] = createHash("sha256").update(readFileSync(from)).digest("hex");
}
cpSync(path.join(source, "node_modules"), path.join(target, "node_modules"), {
  recursive: true, mode: constants.COPYFILE_FICLONE, verbatimSymlinks: true,
  filter: (file) => !path.basename(file).startsWith(".env") && path.basename(file) !== ".npmrc",
});
mkdirSync(path.join(target, ".tmp/agent-home"), { recursive: true });
writeFileSync(path.join(target, ".tmp/source-manifest.json"), JSON.stringify(hashes, null, 2));
console.log(target);
