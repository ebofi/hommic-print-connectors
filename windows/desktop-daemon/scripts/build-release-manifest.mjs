import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
const version = String(packageJson.version || "").trim();
const fileName = `Hommic Print Daemon Setup ${version}.exe`;
const filePath = join(process.cwd(), "release", fileName);

if (!existsSync(filePath)) {
  throw new Error(`Release installer not found: ${filePath}`);
}

const bytes = readFileSync(filePath);
const sha512 = createHash("sha512").update(bytes).digest("base64");
const sizeBytes = statSync(filePath).size;

process.stdout.write(
  JSON.stringify(
    {
      version,
      asset_name: basename(filePath),
      size_bytes: sizeBytes,
      sha512,
    },
    null,
    2,
  ),
);
