// Next 16 removed the `next lint` command, so ESLint is invoked directly and
// needs its own flat config. eslint-config-next ships native flat-config
// arrays from these subpaths, so no FlatCompat shim is required.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  {
    ignores: ["node_modules/**", ".next/**", "next-env.d.ts", "*.tsbuildinfo"],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      // Fetching on mount and syncing theme from localStorage after hydration
      // both call setState from an effect by necessity — the SSR-safe
      // alternatives are a Suspense/`use()` refactor rather than a local fix.
      // Kept visible as a warning rather than silenced.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
