import type { OpportunityDocument } from './opportunityApi';
import { getOpportunityDocumentUrl } from './opportunityApi';
import { MAX_DOCUMENT_INTELLIGENCE_TEXT } from './documentIntelligenceModel';

export interface ExtractedTenderDocument {
  text: string;
  pageCount: number | null;
  truncated: boolean;
  sourceSha256: string;
}

function extension(fileName: string): string {
  return fileName.toLowerCase().split('.').pop() ?? '';
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function extractPdf(buffer: ArrayBuffer): Promise<{ text: string; pageCount: number }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => typeof item.str === 'string' ? item.str : '').join(' '));
    if (pages.join('\n').length >= MAX_DOCUMENT_INTELLIGENCE_TEXT) break;
  }
  return { text: pages.join('\n\n'), pageCount: pdf.numPages };
}

async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  const loaded = await import('mammoth/mammoth.browser');
  const mammoth = (loaded as any).default ?? loaded;
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

export async function extractTenderDocumentText(doc: OpportunityDocument): Promise<ExtractedTenderDocument> {
  const url = await getOpportunityDocumentUrl(doc);
  const response = await fetch(url);
  if (!response.ok) throw new Error('The tender document could not be downloaded for analysis.');
  const buffer = await response.arrayBuffer();
  const sourceSha256 = await sha256(buffer);
  const fileExtension = extension(doc.fileName);
  let extracted = '';
  let pageCount: number | null = null;
  if (fileExtension === 'pdf') {
    const pdf = await extractPdf(buffer);
    extracted = pdf.text;
    pageCount = pdf.pageCount;
  } else if (fileExtension === 'docx') {
    extracted = await extractDocx(buffer);
  } else if (['txt', 'csv', 'html', 'htm', 'xml', 'md', 'rtf'].includes(fileExtension)) {
    extracted = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  } else {
    throw new Error('Document Intelligence currently supports PDF, DOCX, TXT, CSV, HTML, XML, Markdown and RTF files.');
  }
  const normalized = extracted.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (normalized.length < 40) throw new Error('The document contains too little readable text. Scanned image-only PDFs require OCR before analysis.');
  return {
    text: normalized.slice(0, MAX_DOCUMENT_INTELLIGENCE_TEXT),
    pageCount,
    truncated: normalized.length > MAX_DOCUMENT_INTELLIGENCE_TEXT,
    sourceSha256,
  };
}
