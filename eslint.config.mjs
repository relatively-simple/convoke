import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "work/**",
    ".wrangler/**",
    ".vinext/**",
    ".sites-runtime/**",
    "public/runtime/**",
    "vendor/**",
    "next-env.d.ts",
  ]),
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["components/visual-answer.tsx"],
    rules: {
      // Diagrams use self-contained inline SVG data URIs to isolate SVG DOM from parent page
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: ["app/workspace.tsx"],
    rules: {
      // Allow standard HTML anchor link for top-level home navigation without router coupling
      "@next/next/no-html-link-for-pages": "off",
    },
  },
]);

export default eslintConfig;
