/**
 * Sheets Service - Synchronizes persistent facts with Google Sheets via Apps Script.
 * 
 * IMPORTANT: All write operations use GET + URL params (not POST) to avoid the
 * no-cors / Content-Type stripping issue with Google Apps Script.
 * Apps Script's doGet() handles all actions including saves and deletes.
 * Fallback to LocalStorage when no Google Sheets URL is configured.
 */

const LOCAL_STORAGE_KEY = 'charlie_memory_facts_v1';

const DEFAULT_FACTS = {
  Identity_Facts: [
    { Key: 'Name', Value: 'User', Details: 'Primary Assistant User', Updated_At: new Date().toISOString() },
    { Key: 'Primary_Role', Value: 'Full Stack Engineer', Details: 'Software developer working on web apps', Updated_At: new Date().toISOString() },
    { Key: 'Tech_Stack', Value: 'React, Astro, Node.js, Python, Tailwind', Details: 'Core development tools', Updated_At: new Date().toISOString() }
  ],
  Interests_Log: [
    { Timestamp: new Date().toISOString(), Topic: 'React 19 & Server Components', Source: 'YouTube', URL: '' },
    { Timestamp: new Date().toISOString(), Topic: 'AI Function Calling & Agentic Workflows', Source: 'Search Query', URL: '' },
    { Timestamp: new Date().toISOString(), Topic: 'Astro Island Architecture', Source: 'Documentation', URL: '' }
  ],
  Task_Routines: [
    { Key: 'Morning_Routine', Value: 'Open VS Code, Check GitHub, Review System Logs', Details: 'Daily startup task', Updated_At: new Date().toISOString() },
    { Key: 'Preferred_Language', Value: 'TypeScript & Python', Details: 'Language preference for code snippets', Updated_At: new Date().toISOString() }
  ]
};

export class SheetsService {
  static getWebAppUrl() {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('charlie_web_app_url') || '';
    }
    return '';
  }

  static getLocalFacts() {
    if (typeof window === 'undefined') return DEFAULT_FACTS;
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_FACTS));
      return DEFAULT_FACTS;
    }
    try {
      return JSON.parse(stored);
    } catch (e) {
      return DEFAULT_FACTS;
    }
  }

  static saveLocalFacts(facts) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(facts));
    }
  }

  /**
   * Fetch all memory facts from Google Sheets (falls back to localStorage).
   */
  static async getFacts() {
    const webAppUrl = this.getWebAppUrl();
    if (!webAppUrl) {
      return this.getLocalFacts();
    }

    try {
      const url = `${webAppUrl}?action=get_facts&_t=${Date.now()}`;
      const response = await fetch(url);
      const resData = await response.json();
      if (resData.status === 'success' && resData.data) {
        this.saveLocalFacts(resData.data);
        return resData.data;
      }
    } catch (err) {
      console.warn('Failed to fetch facts from Google Sheets, using local fallback:', err);
    }
    return this.getLocalFacts();
  }

  /**
   * Save or update a fact.
   * Uses GET + URLSearchParams to bypass the Apps Script no-cors POST body issue.
   */
  static async saveFact(category, key, value, details = '') {
    // 1. Always update localStorage first (instant local state)
    const local = this.getLocalFacts();
    const targetCat = category || 'Identity_Facts';
    if (!local[targetCat]) local[targetCat] = [];

    const now = new Date().toISOString();
    const existingIdx = local[targetCat].findIndex(
      item => (item.Key || item.Topic || '').toLowerCase() === key.toLowerCase()
    );

    if (existingIdx >= 0) {
      local[targetCat][existingIdx] = {
        ...local[targetCat][existingIdx],
        Value: value,
        Details: details,
        Updated_At: now
      };
    } else {
      local[targetCat].push({ Key: key, Value: value, Details: details, Updated_At: now });
    }
    this.saveLocalFacts(local);

    // 2. Sync to Google Sheets via GET + URL params (avoids CORS/Content-Type issues)
    const webAppUrl = this.getWebAppUrl();
    if (webAppUrl) {
      try {
        const params = new URLSearchParams({
          action: 'save_fact',
          category: targetCat,
          key,
          value,
          details,
          _t: Date.now()
        });
        await fetch(`${webAppUrl}?${params.toString()}`);
        console.log(`[SheetsService] Saved to Sheets: [${targetCat}] ${key} = ${value}`);
      } catch (err) {
        console.warn('[SheetsService] Google Sheets sync failed:', err);
      }
    }

    return { facts: local, synced: !!webAppUrl };
  }

  /**
   * Delete a fact by key.
   * Uses GET + URLSearchParams (same CORS bypass as saveFact).
   */
  static async deleteFact(category, key) {
    // 1. Update localStorage
    const local = this.getLocalFacts();
    const targetCat = category || 'Identity_Facts';
    if (local[targetCat]) {
      local[targetCat] = local[targetCat].filter(
        item => (item.Key || item.Topic || '').toLowerCase() !== key.toLowerCase()
      );
      this.saveLocalFacts(local);
    }

    // 2. Sync deletion to Google Sheets via GET + URL params
    const webAppUrl = this.getWebAppUrl();
    if (webAppUrl) {
      try {
        const params = new URLSearchParams({
          action: 'delete_fact',
          category: targetCat,
          key,
          _t: Date.now()
        });
        await fetch(`${webAppUrl}?${params.toString()}`);
        console.log(`[SheetsService] Deleted from Sheets: [${targetCat}] ${key}`);
      } catch (err) {
        console.warn('[SheetsService] Google Sheets delete failed:', err);
      }
    }

    return { facts: local, synced: !!webAppUrl };
  }

  /**
   * Log a search/activity keyword to Interests_Log.
   * Used by intentHandler for web search queries.
   */
  static async logActivity(topic, source = 'Voice/Search Query') {
    return this.saveFact('Interests_Log', topic, source, new Date().toLocaleString());
  }
}
