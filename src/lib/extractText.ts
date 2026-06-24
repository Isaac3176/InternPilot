export const ACCEPTED_RESUME_TYPES = ".pdf,.docx,.txt,.md";

/**
 * Extract plain text from a resume file (PDF, DOCX, or plain text).
 * The heavy parsers (pdfjs, mammoth) are imported dynamically so they are only
 * loaded when the user actually imports a file, keeping the initial bundle lean.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (name.endsWith(".pdf")) return extractPdf(buffer);

  if (name.endsWith(".docx")) {
    const { default: mammoth } = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value.trim();
  }

  if (name.endsWith(".txt") || name.endsWith(".md")) {
    return new TextDecoder().decode(buffer).trim();
  }

  throw new Error("Unsupported file type. Please use a PDF, DOCX, TXT, or MD file.");
}

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    pages.push(text);
  }
  return pages.join("\n\n").trim();
}
