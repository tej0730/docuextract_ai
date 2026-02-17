import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GEMINI_MODEL_FLASH, SYSTEM_INSTRUCTION } from "../constants";
import { ExtractedData } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      console.error("API_KEY is missing from environment variables.");
    }
    this.ai = new GoogleGenAI({ apiKey: apiKey || '' });
  }

  /**
   * Extracts a human-readable search query from a URL.
   * Useful when direct scraping fails, we can ask Google Search to find the same data.
   */
  private getSearchQueryFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      
      // Extract common search query parameters
      const searchParams = urlObj.searchParams;
      const queryParam = searchParams.get('q') || 
                         searchParams.get('k') || 
                         searchParams.get('search_query') || 
                         searchParams.get('keywords') ||
                         searchParams.get('text');

      if (queryParam) {
        return `${queryParam} on ${domain}`;
      }
      
      // If no query param, look at path (e.g. /c/mobiles -> mobiles)
      const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 2 && !['products', 'search', 'category'].includes(s));
      if (pathSegments.length > 0) {
         return `${pathSegments.join(' ')} products on ${domain}`;
      }

      return `products on ${domain}`;
    } catch (e) {
      return `details from ${url}`;
    }
  }

  /**
   * Fetch raw HTML via a CORS proxy. Tries primary proxy, then fallback.
   */
  private async fetchHtmlViaProxy(url: string): Promise<string | null> {
    const proxies = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    ];
    for (let i = 0; i < proxies.length; i++) {
      try {
        const res = await fetch(proxies[i], { signal: AbortSignal.timeout(15000) });
        if (!res.ok) continue;
        const isRaw = proxies[i].includes('/raw?');
        const html = isRaw ? await res.text() : (await res.json()).contents;
        if (html && typeof html === 'string' && html.length > 200) return html;
      } catch (_) {
        continue;
      }
    }
    return null;
  }

  /**
   * Extract main article/content from HTML with structure preserved (headings, lists, tables).
   */
  private extractStructuredTextFromHtml(doc: Document): string {
    const noiseTags = ['script', 'style', 'svg', 'noscript', 'iframe', 'nav', 'aside', 'form', 'button'];
    const clone = doc.body.cloneNode(true) as HTMLElement;
    noiseTags.forEach(tag => {
      clone.querySelectorAll(tag).forEach(el => el.remove());
    });
    // Remove common non-content wrappers but keep their children
    clone.querySelectorAll('header, footer').forEach(el => {
      el.replaceWith(...el.childNodes);
    });

    const mainSelectors = [
      'article', '[role="main"]', 'main', '.post-content', '.article-body', '.content', '.entry-content',
      '#content', '#main', '.main', '#container', '.product-detail', '[itemprop="articleBody"]',
      '.page-content', '.product-description', '.detail-content',
    ];
    let root: Element = clone;
    for (const sel of mainSelectors) {
      const el = clone.querySelector(sel);
      if (el && el.textContent && el.textContent.trim().length > 100) {
        root = el;
        break;
      }
    }

    const out: string[] = [];
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent?.trim();
        if (t) out.push(t);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      const text = (el as HTMLElement).innerText?.trim() || '';
      if (tag === 'h1') out.push('\n# ' + text + '\n');
      else if (tag === 'h2') out.push('\n## ' + text + '\n');
      else if (tag === 'h3') out.push('\n### ' + text + '\n');
      else if (tag === 'h4') out.push('\n#### ' + text + '\n');
      else if (tag === 'table') {
        const rows = (el as HTMLTableElement).querySelectorAll('tr');
        const rowTexts = Array.from(rows).map(tr =>
          Array.from(tr.querySelectorAll('th, td')).map(c => (c as HTMLElement).innerText?.trim().replace(/\|/g, '\\|')).join(' | ')
        );
        if (rowTexts.length) out.push('\n' + rowTexts.join('\n') + '\n');
      } else if (tag === 'p' || tag === 'li') {
        if (text && !out[out.length - 1]?.endsWith(text)) out.push(text);
      } else {
        el.childNodes.forEach(n => walk(n));
      }
    };
    root.childNodes.forEach(n => walk(n));
    let cleaned = out.join(' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length < 200) cleaned = (root as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() || cleaned;
    return cleaned.substring(0, 60000);
  }

  /** Web-scrape a URL and return structured text for extraction, or null if blocked/failed. */
  private async scrapeUrl(url: string): Promise<string | null> {
    try {
      console.log(`Attempting to scrape: ${url}`);
      const rawHtml = await this.fetchHtmlViaProxy(url);
      if (!rawHtml) return null;

      const parser = new DOMParser();
      const doc = parser.parseFromString(rawHtml, 'text/html');
      const bodyLower = doc.body?.innerText?.toLowerCase() || '';

      if (
        bodyLower.includes('enable javascript') ||
        bodyLower.includes('access denied') ||
        bodyLower.includes('security check') ||
        bodyLower.includes('captcha') ||
        bodyLower.includes('blocked') ||
        bodyLower.length < 300
      ) {
        console.warn("Scraping blocked or empty");
        return null;
      }

      return this.extractStructuredTextFromHtml(doc);
    } catch (error) {
      console.warn("Scraping failed, falling back to Search Tool", error);
      return null;
    }
  }

  async analyzeContent(
    input: string,
    inputType: 'base64' | 'url' | 'text',
    mimeType?: string
  ): Promise<ExtractedData> {
    try {
      const model = GEMINI_MODEL_FLASH;
      let contents: any = {};
      let tools: any[] | undefined = undefined;

      if (inputType === 'url') {
        const scrapedContent = await this.scrapeUrl(input);
        const urlExtractionTask = `
Extract all meaningful data from the content below into **clean, structured Markdown** (same as for documents).
- Preserve headings (# ## ###), lists, and any tables. If you see table-like data, output a proper Markdown table.
- For product/e-commerce pages: use a comparison table (e.g. Product Name | Price | Rating | Key Specs) and use [text](${input}) for links where relevant.
- For articles: use standard Markdown with headers and paragraphs.
- For invoices/financial content: preserve layout and use tables where appropriate.
- Remove ads, navigation text, and non-content noise. Output only the structured data.
`.trim();

        if (scrapedContent) {
          console.log("Using scraped webpage content for extraction");
          contents = {
            role: 'user',
            parts: [{
              text: `**SOURCE URL**: ${input}\n\n**WEBPAGE CONTENT (extracted text/structure)**:\n\n${scrapedContent}\n\n**TASK**: ${urlExtractionTask}`,
            }],
          };
        } else {
          const smartQuery = this.getSearchQueryFromUrl(input);
          console.log(`Fallback to Google Search with query: "${smartQuery}"`);
          contents = {
            role: 'user',
            parts: [{
              text: `The user wants structured data from this URL (we cannot read it directly): ${input}

Use the **Google Search** tool to search for: "${smartQuery}".

Then produce a **structured Markdown report** from the search results:
- Use clear headings and, where appropriate, Markdown tables (e.g. Product Name | Price | Rating | Key Specs).
- Include real links in the form [Name](url) when available.
- If it's product/catalog data, output a comparison table. If it's an article or general page, use headings and paragraphs.
- Do not say you cannot access; compile the best possible structured report from search results.
- Match the same output style as document extraction: clean Markdown, tables preserved, no code fences around the report.`,
            }],
          };
          tools = [{ googleSearch: {} }];
        }
      } else if (inputType === 'base64' && mimeType) {
        contents = {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: input,
              },
            },
            {
              text: `**TASK**: Extract all meaningful data from this file into **clean, structured Markdown**. Preserve headings, lists, and tables. If tables are detected, output proper Markdown tables. If it's an invoice or financial document, preserve layout and use tables. Output only the structured data—no code fences around the report.`,
            },
          ],
        };
      } else {
        // Fallback text
        contents = {
             role: 'user',
             parts: [{ text: input }]
        };
      }

      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: model,
        contents: contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: tools,
          temperature: 0.1,
        },
      });

      let text = response.text || "No content extracted.";
      text = text.replace(/```markdown/gi, '').replace(/```/g, '').trim();

      let detectedType = 'General Document';
      const lowerText = text.toLowerCase();
      if (lowerText.includes('invoice') || lowerText.includes('total') || lowerText.includes('bill to')) detectedType = 'Financial Document';
      else if (lowerText.includes('|') && (lowerText.includes('price') || lowerText.includes('product'))) detectedType = 'Product List';
      else if (inputType === 'url') detectedType = 'Web Page';

      return {
        rawText: text,
        markdown: text,
        summary: text.substring(0, 200) + "...",
        detectedType,
      };

    } catch (error: any) {
      console.error("Gemini API Error:", error);
      throw new Error(error.message || "Failed to analyze content");
    }
  }
}

export const geminiService = new GeminiService();