/** Dependency rules from docs/ARCHITECTURE.md. */
const PURE = "^src/(config|http/retry|http/redact|polling/status|polling/batch|proxy-url/.*)\\.ts$";

module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "pure-modules-stay-pure",
      comment: "Pure modules import nothing with I/O.",
      severity: "error",
      from: { path: PURE },
      to: { path: "^src/(http/transport|resources|polling/wait|client)" },
    },
    {
      name: "resources-not-polling",
      severity: "error",
      from: { path: "^src/resources/" },
      to: { path: "^src/polling/wait" },
    },
    {
      name: "polling-uses-interfaces",
      comment:
        "polling depends on resources only through an interface (type-only imports allowed).",
      severity: "error",
      from: { path: "^src/polling/" },
      to: { path: "^src/(resources|http/transport)", dependencyTypesNot: ["type-only"] },
    },
    {
      name: "nothing-imports-index",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "^src/index\\.ts$" },
    },
    {
      name: "no-node-builtins",
      severity: "error",
      from: { path: "^src/" },
      to: { dependencyTypes: ["core"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
