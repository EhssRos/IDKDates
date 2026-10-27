// Turns the design system's tokens.json into CSS variables, so app and design system never drift apart.
// Update design/tokens.json from the IDKDates design system, then run: npm run tokens
import { readFileSync, writeFileSync } from "node:fs";

const t = JSON.parse(readFileSync(new URL("../design/tokens.json", import.meta.url), "utf8"));
const colors = t.color.tokens;
const block = theme => colors.map(c => `  --${c.name}: ${c.value[theme]};`).join("\n");
const fixed = [...t.spacing.tokens, ...t.radius.tokens].map(x => `  --${x.name}: ${x.value};`).join("\n");
const fonts = Object.entries(t.type.families).map(([k, v]) => `  --font-${k}: ${v};`).join("\n");

const css = `/* Generated from design/tokens.json by scripts/gen-tokens.mjs. Do not edit by hand. */
:root {
${block("light")}
${fixed}
${fonts}
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${block("dark").replace(/^/gm, "  ")}
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
${block("dark")}
  color-scheme: dark;
}
`;
writeFileSync(new URL("../src/web/styles/tokens.css", import.meta.url), css);
console.log(`tokens.css: ${colors.length} colors, ${t.spacing.tokens.length + t.radius.tokens.length} sizes`);
