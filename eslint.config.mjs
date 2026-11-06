import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Project rules from AGENTS.md that a linter can check. Each entry names its rule number there.
const HEX = /^#[0-9a-fA-F]{3,8}$/;
const PROJECT_RULES = {
  nativeSelect: {
    selector: "JSXOpeningElement[name.name='select']",
    message: "Rule 6: use <Dropdown> from components/dropdown.tsx, not a native <select>.",
  },
  dropdownSort: {
    selector: "JSXOpeningElement[name.name='Dropdown'] > JSXAttribute[name.name='sort']",
    message: "Rule 7: dropdowns stay A to Z. Only the Status filter in promise-explorer.tsx may keep lifecycle order.",
  },
  arbitraryHexClass: {
    selector: "Literal[value=/\\[#[0-9a-fA-F]{3,8}\\]/], TemplateElement[value.raw=/\\[#[0-9a-fA-F]{3,8}\\]/]",
    message: "Rule 8: use a color token from app/globals.css, e.g. bg-[var(--match-fg)], not a hex value.",
  },
  hexLiteral: {
    selector: `Literal[value=${HEX}]`,
    message: "Rule 8: use a color token from app/globals.css, not a hex value.",
  },
  hardCodedSiteUrl: {
    selector: "Literal[value=/vercel\\.app/], TemplateElement[value.raw=/vercel\\.app/]",
    message: "Rule 14: use SITE_URL from lib/site.ts instead of a hard-coded vercel.app address.",
  },
  hardCodedSupabaseUrl: {
    selector: "Literal[value=/supabase\\.co/], TemplateElement[value.raw=/supabase\\.co/]",
    message: "Rule 15: use NEXT_PUBLIC_SUPABASE_URL or functionUrl() instead of a hard-coded supabase.co address.",
  },
};

/** The project rules, minus any a specific file is allowed to break. */
function projectRules(...except) {
  return [
    "error",
    ...Object.entries(PROJECT_RULES)
      .filter(([name]) => !except.includes(name))
      .map(([, rule]) => rule),
  ];
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": projectRules(),
      "no-alert": "error", // Rule 12
    },
  },
  // The documented exceptions.
  {
    files: ["components/promise-explorer.tsx"],
    rules: { "no-restricted-syntax": projectRules("dropdownSort") }, // Status keeps lifecycle order.
  },
  {
    files: ["components/texas-star-logo.tsx", "app/global-error.tsx"],
    rules: { "no-restricted-syntax": projectRules("hexLiteral") }, // Logo colors; error page has no stylesheet.
  },
  {
    files: ["lib/site.ts"],
    rules: { "no-restricted-syntax": projectRules("hardCodedSiteUrl") }, // Where SITE_URL is defined.
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Saved copies of campaign pages, including their third-party scripts. Not our code.
    "public/archive/**",
    // Supabase Edge Functions run on Deno and are checked by Deno, not by Next.
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
