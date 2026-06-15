// Bundle the container server (scripts/cli/server.mjs) into a single
// self-contained dist-server/server.mjs. esbuild ships with Vite, so this
// adds no dependency of its own.
//
// The `createRequire` banner is needed because the bundled YAML parser is
// CommonJS and calls require() at runtime; in an ESM output that's undefined,
// so we re-create it from import.meta.url.

import { build } from "esbuild";

await build({
  entryPoints: ["scripts/cli/server.mjs"],
  outfile: "dist-server/server.mjs",
  bundle: true,
  minify: true,
  platform: "node",
  format: "esm",
  target: "node18",
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});

console.log("built dist-server/server.mjs");
