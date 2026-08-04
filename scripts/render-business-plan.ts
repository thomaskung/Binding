/**
 * Render BUSINESS.md (the business plan) to a clean, submission-ready PDF for
 * the CCMF application Section 6.4.
 *
 *   pnpm exec tsx scripts/render-business-plan.ts
 *
 * Output: ccmf-app/ccmf-assets/binding-business-plan.pdf
 */

import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { marked } from "marked";

const md = readFileSync("BUSINESS.md", "utf8");

// Keep only the core business-plan body (drop the version header + history table
// tail so the submitted doc reads as a plan, not an internal changelog).
const historyIdx = md.indexOf("## Revision History");
const body = historyIdx > 0 ? md.slice(0, historyIdx) : md;

marked.setOptions({ gfm: true, breaks: false });

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a1a; line-height: 1.55; font-size: 13px; margin: 0; padding: 0;
  }
  .page { max-width: 780px; margin: 0 auto; padding: 40px 52px; }
  h1 { font-size: 26px; letter-spacing: -0.01em; margin: 0 0 4px; }
  h2 { font-size: 18px; border-bottom: 2px solid #2f6f6f; padding-bottom: 6px; margin: 30px 0 12px; }
  h3 { font-size: 15px; margin: 20px 0 8px; }
  p { margin: 8px 0; }
  ul, ol { margin: 8px 0; padding-left: 22px; }
  li { margin: 4px 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 12.5px; }
  th, td { border: 1px solid #d8d6d2; padding: 7px 10px; text-align: left; vertical-align: top; }
  th { background: #f2f1ee; font-weight: 600; }
  strong { color: #161616; }
  code { background: #f2f1ee; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
  blockquote { margin: 10px 0; padding: 4px 16px; border-left: 3px solid #2f6f6f; color: #444; }
  hr { border: none; border-top: 1px solid #e0deda; margin: 24px 0; }
  .muted { color: #777; font-size: 11.5px; }
</style>
</head>
<body>
<div class="page">
  ${marked.parse(body)}
</div>
</body>
</html>`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.pdf({
    path: "ccmf-app/ccmf-assets/binding-business-plan.pdf",
    format: "A4",
    printBackground: true,
    margin: { top: "0", bottom: "0", left: "0", right: "0" },
  });
  await browser.close();
  console.log("Business plan PDF written");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
