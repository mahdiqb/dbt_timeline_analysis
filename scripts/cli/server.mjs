// Tiny static server for the built SPA — with one trick.
//
// At startup it reads a YAML config (where your dbt artifacts live, which
// datasets have SLAs, …), runs the *same* loadProject() adapter the app uses
// over those artifacts, applies the config, and injects the resulting
// DbtProject into index.html as `window.__DBT_PROJECT__`. So the container
// renders YOUR data with no build step and no code: write a config.yml, mount
// it, go. With nothing configured it serves the bundled synthetic demo.
//
// Bundled into a single self-contained file by `npm run build:server`
// (esbuild, which ships with Vite); the YAML parser is bundled in too, so the
// runtime image still needs only Node + dist/.
//
// Resolution order:
//   config file:  CONFIG_FILE  >  /config/config.y(a)ml  >  $DATA_DIR/config.y(a)ml  >  ./config.yml
//   artifacts:    config.artifacts (relative to the config file)  >  DATA_DIR  >  /data
//   port:         env PORT  >  config.port  >  8080

import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import { loadProject, hhmmToMinutes } from "../../src/data/loadProject.ts";
import { project as syntheticProject } from "../../src/data/generate.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const isoDate = (s) => /^\d{4}-\d{2}-\d{2}/.test(s);

// ── config (YAML) ──────────────────────────────────────────────────────────

function findConfig() {
  const candidates = [
    process.env.CONFIG_FILE,
    "/config/config.yml",
    "/config/config.yaml",
    process.env.DATA_DIR && path.join(process.env.DATA_DIR, "config.yml"),
    process.env.DATA_DIR && path.join(process.env.DATA_DIR, "config.yaml"),
    "/data/config.yml",
    "/data/config.yaml",
    path.resolve("config.yml"),
    path.resolve("dbt-sla-tracker.yml"),
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || null;
}

function loadConfig() {
  const file = findConfig();
  if (!file) return { config: {}, dir: process.cwd() };
  try {
    const parsed = parseYaml(readFileSync(file, "utf8"));
    const config = parsed && typeof parsed === "object" ? parsed : {};
    console.log(`[dbt-sla] config: ${file}`);
    return { config, dir: path.dirname(file) };
  } catch (err) {
    console.error(`[dbt-sla] couldn't parse ${file}: ${err.message} — ignoring it`);
    return { config: {}, dir: process.cwd() };
  }
}

const { config, dir: CONFIG_DIR } = loadConfig();
const DATA_DIR = config.artifacts
  ? path.resolve(CONFIG_DIR, String(config.artifacts))
  : process.env.DATA_DIR || "/data";
const PORT = Number(process.env.PORT || config.port || 8080);

// ── locate the built SPA ────────────────────────────────────────────────────

function resolveDist() {
  if (process.env.DIST_DIR) return path.resolve(process.env.DIST_DIR);
  for (const c of [path.join(HERE, "dist"), path.join(HERE, "..", "dist")]) {
    if (existsSync(path.join(c, "index.html"))) return c;
  }
  return path.join(HERE, "dist");
}

// ── discover dbt artifacts ──────────────────────────────────────────────────
//
// Supports three layouts:
//   1. flat:           DATA_DIR/manifest.json + DATA_DIR/runs/run_results.<date>.json
//   2. folder-per-run: DATA_DIR/<date>/{manifest,run_results,sources}.json   (a target/ snapshot)
//   3. single run:     DATA_DIR/{manifest,run_results,sources}.json

function discover(dir) {
  const runsDir = path.join(dir, "runs");
  if (existsSync(path.join(dir, "manifest.json")) && existsSync(runsDir)) {
    const dates = readdirSync(runsDir)
      .map((f) => /^run_results\.(.+)\.json$/.exec(f)?.[1])
      .filter(Boolean)
      .sort();
    const history = dates.map((date) => ({
      date: isoDate(date) ? date.slice(0, 10) : undefined,
      runResults: readJson(path.join(runsDir, `run_results.${date}.json`)),
      sources: existsSync(path.join(runsDir, `sources.${date}.json`))
        ? readJson(path.join(runsDir, `sources.${date}.json`))
        : undefined,
    }));
    return { manifest: readJson(path.join(dir, "manifest.json")), history };
  }

  const runDirs = readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((p) => {
      try {
        return statSync(p).isDirectory() && existsSync(path.join(p, "run_results.json"));
      } catch {
        return false;
      }
    })
    .sort();
  if (runDirs.length) {
    const history = runDirs.map((p) => {
      const name = path.basename(p);
      return {
        date: isoDate(name) ? name.slice(0, 10) : undefined,
        runResults: readJson(path.join(p, "run_results.json")),
        sources: existsSync(path.join(p, "sources.json"))
          ? readJson(path.join(p, "sources.json"))
          : undefined,
      };
    });
    const manifestPath = existsSync(path.join(dir, "manifest.json"))
      ? path.join(dir, "manifest.json")
      : path.join(runDirs[runDirs.length - 1], "manifest.json");
    return { manifest: readJson(manifestPath), history };
  }

  if (existsSync(path.join(dir, "run_results.json")) && existsSync(path.join(dir, "manifest.json"))) {
    return {
      manifest: readJson(path.join(dir, "manifest.json")),
      history: [
        {
          runResults: readJson(path.join(dir, "run_results.json")),
          sources: existsSync(path.join(dir, "sources.json"))
            ? readJson(path.join(dir, "sources.json"))
            : undefined,
        },
      ],
    };
  }

  return null;
}

/**
 * Load + adapt the project from disk. Returns null when there's simply no data
 * (→ demo), but THROWS if files exist yet can't be read/parsed — so a refresh
 * that catches a file mid-write keeps the last-good project instead of flipping
 * to the demo.
 */
function loadFromDisk() {
  if (!existsSync(DATA_DIR)) return null;
  const found = discover(DATA_DIR);
  if (!found || !found.history.length) return null;
  return loadProject(found.manifest, found.history);
}

/** The project the app should render: disk data (if any) + config, else the demo. */
function buildProject({ quiet = false } = {}) {
  const loaded = loadFromDisk();
  if (!quiet) {
    console.log(
      loaded
        ? `[dbt-sla] loaded ${loaded.models.length} models, ${loaded.runs.length} runs from ${DATA_DIR}`
        : `[dbt-sla] no dbt artifacts in ${DATA_DIR} — serving the synthetic demo`,
    );
  }
  return applyConfig(loaded ?? syntheticProject, config);
}

// ── apply config to the project ─────────────────────────────────────────────

function applyConfig(project, config) {
  // Map a config key (model name OR full unique_id) to a unique_id.
  const idForKey = (key) =>
    (project.modelsById[key] ? key : undefined) ??
    project.models.find((m) => m.name === key)?.uniqueId ??
    null;

  if (config.project_name) project.name = String(config.project_name);

  if (config.slas && typeof config.slas === "object") {
    for (const [key, value] of Object.entries(config.slas)) {
      const id = idForKey(key);
      if (!id) {
        console.warn(`[dbt-sla] config.slas: no model named "${key}" — skipped`);
        continue;
      }
      const targetMinutes = hhmmToMinutes(String(value));
      if (!Number.isFinite(targetMinutes)) {
        console.warn(`[dbt-sla] config.slas."${key}": "${value}" is not an HH:MM time — skipped`);
        continue;
      }
      project.slas[id] = {
        uniqueId: id,
        targetMinutes,
        label: `${String(value).replace(/\s*UTC$/i, "")} UTC`,
      };
    }
  }

  if (config.owners && typeof config.owners === "object") {
    for (const [key, value] of Object.entries(config.owners)) {
      const id = idForKey(key);
      if (id) project.modelsById[id].owner = String(value);
      else console.warn(`[dbt-sla] config.owners: no model named "${key}" — skipped`);
    }
  }

  const maxRuns = Number(config.max_runs);
  if (Number.isFinite(maxRuns) && maxRuns >= 1 && project.runs.length > maxRuns) {
    project.runs = project.runs.slice(-Math.floor(maxRuns));
  }

  return project;
}

// ── serve ───────────────────────────────────────────────────────────────────

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function injectProject(html, project) {
  // Escape "<" so the embedded JSON can't break out of the <script> element.
  const json = JSON.stringify(project).replace(/</g, "\\u003c");
  const tag = `<script>window.__DBT_PROJECT__=${json}</script>`;
  return html.includes("</head>") ? html.replace("</head>", `${tag}</head>`) : tag + html;
}

const DIST = resolveDist();

let bootProject;
try {
  bootProject = buildProject();
} catch (err) {
  console.error(`[dbt-sla] startup: couldn't build from ${DATA_DIR} (${err.message}) — using demo`);
  bootProject = applyConfig(syntheticProject, config);
}
// projectJson is the last-good payload served at /project.json; the initial
// page also boots from it (injected into the HTML). Refreshes update it.
let projectJson = JSON.stringify(bootProject);
const indexHtml = injectProject(
  readFileSync(path.join(DIST, "index.html"), "utf8"),
  bootProject,
);

const sendHtml = (res) => {
  res.writeHead(200, { "Content-Type": MIME[".html"] });
  res.end(indexHtml);
};

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);

    if (pathname === "/" || pathname === "/index.html") return sendHtml(res);
    if (pathname === "/project.json") {
      // Rebuild from disk so the client's refresh button picks up new runs.
      try {
        projectJson = JSON.stringify(buildProject({ quiet: true }));
      } catch (err) {
        console.error(`[dbt-sla] refresh read failed (${err.message}); returning last-good`);
      }
      res.writeHead(200, { "Content-Type": MIME[".json"] });
      return res.end(projectJson);
    }
    if (pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": MIME[".txt"] });
      return res.end("ok");
    }

    const filePath = path.join(DIST, pathname);
    const rel = path.relative(DIST, filePath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      res.writeHead(403);
      return res.end("forbidden");
    }
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      });
      return res.end(await readFile(filePath));
    }
    // SPA fallback — any unknown route renders the app.
    return sendHtml(res);
  } catch {
    res.writeHead(500);
    res.end("internal error");
  }
});

server.listen(PORT, () => {
  console.log(`[dbt-sla] serving on http://localhost:${PORT}  (data dir: ${DATA_DIR})`);
});
