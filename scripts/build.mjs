import { build } from "esbuild";
import { readFile } from "node:fs/promises";
const license = await readFile(new URL("../LICENSE", import.meta.url), "utf8");
await build({
  entryPoints: ["src/plugin.mjs"],
  outfile: "dist/plugin.js",
  banner: { js: "/*\n" + license + "*/" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  legalComments: "eof",
});
await build({
  entryPoints: ["examples/design-studio/server.mjs"],
  outfile: "dist/design-example.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  legalComments: "eof",
});
