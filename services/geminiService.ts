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

  // --- SCRAPING HELPER (Client-Side Technique) ---
  private async scrapeUrl(url: string): Promise<string | null> {
    try {
      console.log(`Attempting to scrape: ${url}`);
      
      // Use a CORS proxy to bypass browser restrictions
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      
      if (!response.ok) return null;

      const data = await response.json();
      const rawHtml = data.contents;

      if (!rawHtml || typeof rawHtml !== 'string') return null;

      // Parse and Clean HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawHtml, 'text/html');

      // Check for "Anti-Bot" or "JS Required" pages
      const pageText = doc.body.innerText.toLowerCase();
      if (pageText.includes("enable javascript") || 
          pageText.includes("access denied") || 
          pageText.includes("security check") ||
          pageText.length < 500) {
          console.warn("Scraping blocked or empty");
          return null; 
      }

      // Remove noise
      const noiseTags = ['script', 'style', 'svg', 'noscript', 'iframe', 'footer', 'nav', 'header', 'aside'];
      noiseTags.forEach(tag => {
        const elements = doc.querySelectorAll(tag);
        elements.forEach(el => el.remove());
      });

      const mainContent = doc.querySelector('main') || doc.querySelector('#container') || doc.body;
      let cleanedText = mainContent.innerText || "";
      cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
      
      return cleanedText.substring(0, 50000);

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
        // STRATEGY: Hybrid Scraping with Fallback
        const scrapedContent = await this.scrapeUrl(input);

        if (scrapedContent) {
            // SCENARIO A: Direct Scrape Success
            console.log("Using Scraped HTML Content");
            contents = {
                role: 'user',
                parts: [{ 
                    text: `**SOURCE URL**: ${input}\n\n**RAW WEBPAGE CONTENT**: \n${scrapedContent}\n\n**TASK**: Extract data from this content.\n- If it's a product list, create a **Markdown Table** (Product, Price, Rating, Specs).\n- Construct links as [Name](${input}).\n- Ignore garbage text.` 
                }]
            };
        } else {
            // SCENARIO B: Blocked/Failed -> Use Google Search Grounding
            const smartQuery = this.getSearchQueryFromUrl(input);
            console.log(`Fallback to Google Search with query: "${smartQuery}"`);
            
            contents = {
                role: 'user',
                parts: [{ 
                    text: `You are an expert Data Extractor.
                    
                    **TASK**: The user wants to extract product list data from this URL: ${input}
                    
                    **ISSUE**: The URL is protected against direct reading.
                    
                    **SOLUTION**: 
                    1. Use the **Google Search Tool** to search for: "${smartQuery}".
                    2. Look for the *latest* prices and details for these products.
                    3. **COMPILE A REPORT**: Create a detailed **Markdown Table** with the results.
                    
                    **TABLE COLUMNS**:
                    | Product Name | Price (approx) | Rating | Key Specs |
                    | :--- | :--- | :--- | :--- |
                    | [Name of Product](Link found in search) | ₹... | 4.x | ... |

                    **RULES**:
                    - NEVER say "I cannot access".
                    - ALWAYS provide a table based on the search results.
                    - If exact price is unknown, provide a range or "Check Site".
                    ` 
                }]
            };
            tools = [{ googleSearch: {} }];
        }
        
      } else if (inputType === 'base64' && mimeType) {
        // For Files (PDF, Image, Audio, Video)
        contents = {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: input,
              },
            },
            { text: `**TASK**: Extract all meaningful data from this file into a structured Markdown format. If tables are detected, preserve them. If it's an invoice, extract details.` }
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
      
      // Cleanup
      text = text.replace(/```markdown/gi, '').replace(/```/g, '').trim();

      // Heuristic Type Detection
      let detectedType = 'General Document';
      const lowerText = text.toLowerCase();
      if (lowerText.includes('invoice') || lowerText.includes('total')) detectedType = 'Financial Document';
      else if (lowerText.includes('|') && lowerText.includes('price')) detectedType = 'Product List';
      else if (inputType === 'url') detectedType = 'Web Data';

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