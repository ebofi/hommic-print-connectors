import { build } from "esbuild";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const outdir = join(process.cwd(), "dist", "renderer");

if (!existsSync(outdir)) {
  mkdirSync(outdir, { recursive: true });
}

await build({
  bundle: true,
  entryPoints: [join(process.cwd(), "src", "renderer", "main.tsx")],
  outfile: join(outdir, "bundle.js"),
  platform: "browser",
  format: "iife",
  target: ["chrome126"],
  jsx: "automatic",
  sourcemap: false,
  loader: {
    ".png": "file",
  },
});
