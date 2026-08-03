#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { processPdf } from "@firecrawl/pdf-inspector";

const input = resolve(process.argv[2]);
const output = process.argv[3] ? resolve(process.argv[3]) : `${input}.md`;

const pdf = readFileSync(input);
const result = processPdf(pdf);

if (!result.markdown) {
  console.error(`[${result.pdfType}] No extractable text — this PDF may need OCR.`);
  process.exit(1);
}

writeFileSync(output, result.markdown);
console.log(`Wrote ${output} (${result.pdfType}, ${result.markdown.length} chars)`);
