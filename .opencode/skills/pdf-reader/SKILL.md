---
name: pdf-reader
description: Convert PDF files to readable markdown using Firecrawl's pdf-inspector (Rust PDF parser with smart text/scanned classification). Use whenever asked to read, extract text from, or summarize a PDF file.
---

# PDF Reader

This repo includes `@firecrawl/pdf-inspector` (fast Rust-based PDF text extraction) wrapped in a small Node script. Use it to read PDF files that the agent's native PDF support cannot handle.

## When to use

- User asks you to read/analyze a PDF
- A PDF file path is referenced but you cannot read binary/PDF content directly
- You need resume text, report content, or any document text from a PDF

## Steps

1. **Check input exists** — confirm the PDF path is valid before running.

2. **Convert PDF to markdown**:

```bash
node scripts/pdf2md.mjs "<input.pdf>" /tmp/output.md
```

3. **Read the output** with the Read tool:

```
Read /tmp/output.md
```

4. **Handle non-text PDFs**:
   - If the script exits with "No extractable text" or reports `Scanned`/`ImageBased`/`Mixed` with null markdown, the PDF has no embedded text layer.
   - Flag this to the user: *"This PDF is scanned/image-based and needs OCR, which pdf-inspector does not provide."*
   - Do NOT fabricate content from an unreadable PDF.

5. **Cleanup** — write output to `/tmp/` so it never pollutes the repo.

## Notes

- `scripts/pdf2md.mjs` takes `<input> [output]`; without `output` it writes `<input>.md` next to the source. Prefer explicit `/tmp` output.
- The tool classifies PDFs (`TextBased`, `Scanned`, `ImageBased`, `Mixed`) — text-based PDFs extract in ~150ms, no OCR, no network.
- Table/column/layout structure is preserved in the markdown output.
