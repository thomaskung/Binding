import { chromium } from "@playwright/test";
import { resolve } from "path";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${resolve("docs/ccmf-deck.html")}`, { waitUntil: "networkidle" });
  await page.pdf({
    path: resolve("docs/ccmf-assets/binding-deck.pdf"),
    width: "1280px",
    height: "720px",
    printBackground: true,
    pageRanges: "1-10",
  });
  await browser.close();
  console.log("Deck PDF written");
}

main().catch((e) => { console.error(e); process.exit(1); });
