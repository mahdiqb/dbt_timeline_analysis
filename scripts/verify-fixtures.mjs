// Round-trip test for the adapter. Run with: npm run fixtures:verify
//
// We generate fixtures by serializing generate.ts's project into dbt
// artifacts (see make-fixtures.mjs), so reading them back through
// loadProject() must reconstruct an equivalent project. This asserts that —
// the strongest check we can make without a live warehouse — plus a couple
// of focused unit tests for the adapter's parsing edges.
//
// Zero new deps: node:test + node:assert (built in) and esbuild (via Vite)
// to import the TS modules.

import { test } from "node:test";
import assert from "node:assert/strict";
import { transform } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

async function importTs(rel) {
  const src = await readFile(path.join(ROOT, rel), "utf8");
  const { code } = await transform(src, {
    loader: "ts",
    format: "esm",
    target: "es2021",
  });
  const url =
    "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  return import(url);
}

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

async function readFixtures() {
  const dir = path.join(ROOT, "fixtures/dbt");
  const manifest = await readJson(path.join(dir, "manifest.json"));
  const files = await readdir(path.join(dir, "runs"));
  const dates = files
    .map((f) => /^run_results\.(\d{4}-\d{2}-\d{2})\.json$/.exec(f)?.[1])
    .filter(Boolean)
    .sort();
  const history = [];
  for (const date of dates) {
    history.push({
      date,
      runResults: await readJson(path.join(dir, "runs", `run_results.${date}.json`)),
      sources: await readJson(path.join(dir, "runs", `sources.${date}.json`)),
    });
  }
  return { manifest, history };
}

// --- modules + data under test (top-level await is fine in ESM) ------------
const { project: original } = await importTs("src/data/generate.ts");
const { loadProject, hhmmToMinutes } = await importTs("src/data/loadProject.ts");
const { manifest, history } = await readFixtures();
const loaded = loadProject(manifest, history);

const TS_TOLERANCE_MS = 2; // serialize→ISO→parse can drift sub-millisecond

const MODEL_FIELDS = [
  "uniqueId",
  "name",
  "layer",
  "materialization",
  "schema",
  "owner",
  "tags",
  "description",
  "dependsOn",
];

test("project metadata round-trips", () => {
  assert.equal(loaded.name, original.name);
  assert.equal(loaded.models.length, original.models.length);
  assert.equal(loaded.runs.length, original.runs.length);
});

test("DAG (models + edges) round-trips", () => {
  for (const want of original.models) {
    const got = loaded.modelsById[want.uniqueId];
    assert.ok(got, `missing model ${want.uniqueId}`);
    for (const f of MODEL_FIELDS) {
      assert.deepEqual(got[f], want[f], `model ${want.name}.${f}`);
    }
  }
  // Forward adjacency, compared order-independently.
  for (const id of Object.keys(original.childrenOf)) {
    assert.deepEqual(
      [...(loaded.childrenOf[id] ?? [])].sort(),
      [...original.childrenOf[id]].sort(),
      `childrenOf ${id}`,
    );
  }
});

test("SLAs round-trip", () => {
  assert.deepEqual(loaded.slas, original.slas);
});

test("run history round-trips (status, rows, timing)", () => {
  assert.deepEqual(
    loaded.runs.map((r) => r.date),
    original.runs.map((r) => r.date),
  );
  for (let i = 0; i < original.runs.length; i++) {
    const o = original.runs[i];
    const l = loaded.runs[i];
    assert.ok(Math.abs(l.startedAt - o.startedAt) <= TS_TOLERANCE_MS, `run[${i}].startedAt`);
    for (const id of Object.keys(o.results)) {
      const or = o.results[id];
      const lr = l.results[id];
      assert.ok(lr, `run[${i}] missing result ${id}`);
      assert.equal(lr.status, or.status, `run[${i}] ${id}.status`);
      assert.equal(lr.executionSeconds, or.executionSeconds, `run[${i}] ${id}.executionSeconds`);
      assert.equal(lr.rowsAffected, or.rowsAffected, `run[${i}] ${id}.rowsAffected`);
      assert.ok(Math.abs(lr.startedAt - or.startedAt) <= TS_TOLERANCE_MS, `run[${i}] ${id}.startedAt`);
      assert.ok(Math.abs(lr.completedAt - or.completedAt) <= TS_TOLERANCE_MS, `run[${i}] ${id}.completedAt`);
    }
  }
});

test("hhmmToMinutes parses HH:MM, H:MM, and trailing UTC; rejects junk", () => {
  assert.equal(hhmmToMinutes("05:30"), 330);
  assert.equal(hhmmToMinutes("5:30"), 330);
  assert.equal(hhmmToMinutes("04:00 UTC"), 240);
  assert.ok(Number.isNaN(hhmmToMinutes("nope")));
  assert.ok(Number.isNaN(hhmmToMinutes("09:99"))); // minutes out of range
});

test("a result with no execute timing falls back to the run's midnight", () => {
  const date = Date.UTC(2026, 0, 2); // 2026-01-02
  const mini = loadProject(
    {
      metadata: { project_name: "mini" },
      nodes: {
        "model.mini.fct_x": {
          unique_id: "model.mini.fct_x",
          resource_type: "model",
          name: "fct_x",
          schema: "analytics",
          tags: ["marts"],
          config: { materialized: "table", meta: { sla: "06:00" } },
          depends_on: { nodes: [] },
        },
      },
      sources: {},
    },
    [
      {
        date: "2026-01-02",
        runResults: {
          metadata: { generated_at: "2026-01-02T06:00:00Z" },
          results: [{ unique_id: "model.mini.fct_x", status: "skipped" }],
        },
      },
    ],
  );
  const r = mini.runs[0].results["model.mini.fct_x"];
  assert.equal(r.status, "skipped");
  assert.equal(r.startedAt, date);
  assert.equal(r.completedAt, date);
  assert.equal(mini.slas["model.mini.fct_x"].targetMinutes, 360);
});
