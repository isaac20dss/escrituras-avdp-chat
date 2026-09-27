import { ScriptSection } from '../types';

export const DEFAULT_DOC_ID = '1uY0XyKsySWbkwD_Lmso90TskzMbWcwnMyEtj4gELPgk';

// Helper to extract ID from a full Google Doc URL
export const extractDocId = (input: string): string => {
  // Matches the ID between /d/ and /
  const match = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  // Return input as is if it looks like a raw ID (no slashes)
  if (!input.includes('/')) {
    return input;
  }
  return '';
};

// Servidor local (server.cjs) busca o Doc direto do Google, sem CORS.
// Os proxies públicos ficam só como reserva, pois são instáveis e têm limite de uso.
const LOCAL_DOC_URL = (docId: string) => `http://localhost:3001/doc?id=${encodeURIComponent(docId)}`;

const PROXIES = [
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
];

const FETCH_TIMEOUT_MS = 20000;

const fetchText = async (url: string): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Status ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
};

export const fetchScriptSections = async (docId: string = DEFAULT_DOC_ID): Promise<ScriptSection[]> => {
  // Add timestamp to prevent caching
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=html&t=${Date.now()}`;
  
  let htmlText = '';
  let lastError = null;
  let success = false;

  // Tenta o servidor local primeiro e depois os proxies públicos
  const sources = [LOCAL_DOC_URL(docId), ...PROXIES.map(proxyGen => proxyGen(exportUrl))];
  for (const url of sources) {
    try {
      htmlText = await fetchText(url);
      success = true;
      break; // Stop if successful
    } catch (e) {
      console.warn("Doc fetch attempt failed, trying next...", url, e);
      lastError = e;
    }
  }

  if (!success || !htmlText) {
    throw lastError || new Error("Failed to fetch document from all proxies.");
  }

  try {
    // Parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    
    const sections: ScriptSection[] = [];
    let currentSection: ScriptSection | null = null;
    
    // Iterate through body children to group by H1
    const nodes = Array.from(doc.body.children);
    
    nodes.forEach(node => {
      // If we find an H1, start a new section
      if (node.tagName === 'H1') {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          title: node.textContent?.trim() || 'Untitled Section',
          body: ''
        };
      } else if (currentSection) {
        // If we are inside a section, add the node to the body
        const element = node as HTMLElement;
        
        // AGGRESSIVE CLEANING: 
        // Remove styles and classes to prevent Google Doc formatting (colors, fonts)
        // from conflicting with our Teleprompter styling (white text).
        element.removeAttribute('style');
        element.removeAttribute('class');
        element.querySelectorAll('*').forEach(el => {
          el.removeAttribute('style');
          el.removeAttribute('class');
        });
        
        let htmlContent = element.outerHTML;
        
        // Replace non-breaking spaces (entities and unicode) with regular spaces.
        htmlContent = htmlContent.replace(/&nbsp;/g, ' ').replace(/\u00A0/g, ' ');
        
        currentSection.body += htmlContent;
      }
    });

    // Push the last section
    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  } catch (parseError) {
    console.error("Error parsing doc:", parseError);
    // Return empty array but don't throw, as the fetch was technically successful
    return [];
  }
};