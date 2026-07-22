/**
 * Sheets Service - Synchronizes persistent facts with Google Sheets
 * Fallback to LocalStorage if Google Sheets URL is not configured yet.
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

  static async getFacts() {
    const webAppUrl = this.getWebAppUrl();
    if (!webAppUrl) {
      return this.getLocalFacts();
    }

    try {
      const response = await fetch(`${webAppUrl}?action=get_facts`);
      const resData = await response.json();
      if (resData.status === 'success' && resData.data) {
        this.saveLocalFacts(resData.data);
        return resData.data;
      }
    } catch (err) {
      console.warn('Failed to fetch facts from Google Sheets Web App, using local memory store fallback:', err);
    }
    return this.getLocalFacts();
  }

  static async saveFact(category, key, value, details = '') {
    const local = this.getLocalFacts();
    const targetCat = category || 'Identity_Facts';
    if (!local[targetCat]) local[targetCat] = [];

    const now = new Date().toISOString();
    const existingIdx = local[targetCat].findIndex(
      item => (item.Key || item.Topic || '').toLowerCase() === key.toLowerCase()
    );

    if (existingIdx >= 0) {
      local[targetCat][existingIdx] = { ...local[targetCat][existingIdx], Value: value, Details: details, Updated_At: now };
    } else {
      local[targetCat].push({ Key: key, Value: value, Details: details, Updated_At: now });
    }
    this.saveLocalFacts(local);

    const webAppUrl = this.getWebAppUrl();
    if (webAppUrl) {
      try {
        await fetch(webAppUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save_fact', category: targetCat, key, value, details })
        });
      } catch (err) {
        console.warn('Google Sheets sync error:', err);
      }
    }
    return local;
  }

  static async deleteFact(category, key) {
    const local = this.getLocalFacts();
    const targetCat = category || 'Identity_Facts';
    if (local[targetCat]) {
      local[targetCat] = local[targetCat].filter(
        item => (item.Key || item.Topic || '').toLowerCase() !== key.toLowerCase()
      );
      this.saveLocalFacts(local);
    }

    const webAppUrl = this.getWebAppUrl();
    if (webAppUrl) {
      try {
        await fetch(webAppUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete_fact', category: targetCat, key })
        });
      } catch (err) {
        console.warn('Google Sheets delete error:', err);
      }
    }
    return local;
  }
}
