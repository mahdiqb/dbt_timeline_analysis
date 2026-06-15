// Minimal ambient types for the Vite-specific APIs we use.
// (We deliberately don't pull in all of `vite/client` to keep the
// surface small — only `import.meta.glob`, used by loadProjectFromFixtures.)

interface ImportMeta {
  glob: (
    pattern: string,
    options?: { eager?: boolean },
  ) => Record<string, unknown>;
}

interface Window {
  /**
   * A DbtProject built from mounted dbt artifacts and injected by the
   * container server (scripts/cli/server.mjs) before the app boots.
   */
  __DBT_PROJECT__?: import("./types/dbt").DbtProject;
}
