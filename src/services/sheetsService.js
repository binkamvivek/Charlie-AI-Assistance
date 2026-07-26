/**
 * Sheets Service - Synchronizes persistent facts with Google Sheets via Apps Script.
 * 
 * IMPORTANT: All write operations use GET + URL params (not POST) to avoid the
 * no-cors / Content-Type stripping issue with Google Apps Script.
 * Apps Script's doGet() handles all actions including saves and deletes.
 * Fallback to LocalStorage when no Google Sheets URL is configured.
 */

const LOCAL_STORAGE_KEY = 'charlie_memory_facts_v1';
const LOCAL_CONTACTS_KEY = 'charlie_contacts_v1';

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

  // ============================================================================
  // CONTACTS MANAGEMENT (localStorage + optional Google Sheets sync)
  // ============================================================================

  /**
   * Get all saved contacts from localStorage.
   */
  static getLocalContacts() {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(LOCAL_CONTACTS_KEY);
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch (e) {
      return [];
    }
  }

  /**
   * Save contacts to localStorage.
   */
  static saveLocalContacts(contacts) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_CONTACTS_KEY, JSON.stringify(contacts));
    }
  }

  /**
   * Save a contact (nickname → phone number mapping).
   * Works offline with localStorage, and syncs to Google Sheets if configured.
   */
  static async saveContact(nickname, phone) {
    const contacts = this.getLocalContacts();
    const existingIdx = contacts.findIndex(
      c => c.nickname.toLowerCase() === nickname.toLowerCase()
    );
    if (existingIdx >= 0) {
      contacts[existingIdx].phone = phone;
      contacts[existingIdx].updatedAt = new Date().toISOString();
    } else {
      contacts.push({ nickname, phone, createdAt: new Date().toISOString() });
    }
    this.saveLocalContacts(contacts);

    // Sync to Google Sheets
    const webAppUrl = this.getWebAppUrl();
    if (webAppUrl) {
      try {
        const params = new URLSearchParams({
          action: 'save_contact',
          nickname,
          phone,
          _t: Date.now()
        });
        await fetch(`${webAppUrl}?${params.toString()}`);
      } catch (err) {
        console.warn('[SheetsService] Contact sync to Sheets failed:', err);
      }
    }

    return { contacts, saved: true };
  }

  /**
   * Find a contact by nickname (case-insensitive, partial match).
   * Returns { found: true, phone, nickname } or { found: false }.
   */
  static async findContact(nickname) {
    const searchName = nickname.toLowerCase().trim();
    const contacts = this.getLocalContacts();

    // Exact match first
    const exact = contacts.find(c => c.nickname.toLowerCase() === searchName);
    if (exact) return { found: true, phone: exact.phone, nickname: exact.nickname };

    // Partial match (nickname starts with search term or vice versa)
    const partial = contacts.find(c =>
      c.nickname.toLowerCase().includes(searchName) ||
      searchName.includes(c.nickname.toLowerCase())
    );
    if (partial) return { found: true, phone: partial.phone, nickname: partial.nickname };

    // Try Google Sheets lookup if configured
    const webAppUrl = this.getWebAppUrl();
    if (webAppUrl) {
      try {
        const params = new URLSearchParams({ action: 'find_contact', nickname, _t: Date.now() });
        const response = await fetch(`${webAppUrl}?${params.toString()}`);
        const data = await response.json();
        if (data.status === 'success' && data.found) {
          // Sync found contact to local storage
          this.saveContact(data.nickname, data.phone);
          return { found: true, phone: data.phone, nickname: data.nickname };
        }
      } catch (err) {
        console.warn('[SheetsService] Contact lookup from Sheets failed:', err);
      }
    }

    return { found: false };
  }

  /**
   * Get all contacts (local + remote merged).
   */
  static async getContacts() {
    // Start with local
    let contacts = this.getLocalContacts();

    // Merge with Google Sheets if configured
    const webAppUrl = this.getWebAppUrl();
    if (webAppUrl) {
      try {
        const params = new URLSearchParams({ action: 'get_contacts', _t: Date.now() });
        const response = await fetch(`${webAppUrl}?${params.toString()}`);
        const data = await response.json();
        if (data.status === 'success' && data.data) {
          // Merge: remote contacts take priority, then add any local-only
          const remoteMap = {};
          data.data.forEach(c => { remoteMap[(c.nickname || '').toLowerCase()] = c; });
          const merged = [];
          const seen = new Set();
          // First add all remote contacts
          data.data.forEach(c => {
            merged.push(c);
            seen.add((c.nickname || '').toLowerCase());
          });
          // Then add local contacts not already in remote
          contacts.forEach(c => {
            if (!seen.has(c.nickname.toLowerCase())) {
              merged.push(c);
            }
          });
          contacts = merged;
          this.saveLocalContacts(contacts);
        }
      } catch (err) {
        console.warn('[SheetsService] Contacts fetch from Sheets failed:', err);
      }
    }

    return contacts;
  }

  // ============================================================================
  // AWAY MODE STORAGE
  // ============================================================================

  static LOCAL_AWAY_KEY = 'charlie_away_mode_v1';

  static getLocalAwayState() {
    if (typeof window === 'undefined') return { active: false, phoneNumbers: [], customMessage: '' };
    const stored = localStorage.getItem(SheetsService.LOCAL_AWAY_KEY);
    if (!stored) return { active: false, phoneNumbers: [], customMessage: '' };
    try {
      return JSON.parse(stored);
    } catch (_) {
      return { active: false, phoneNumbers: [], customMessage: '' };
    }
  }

  static saveLocalAwayState(state) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SheetsService.LOCAL_AWAY_KEY, JSON.stringify(state));
    }
  }

  /**
   * Sync away mode state to Google Sheets.
   */
  static async syncAwayStateToSheets(active, phoneNumbers, customMessage) {
    const webAppUrl = SheetsService.getWebAppUrl();
    if (!webAppUrl) return;
    try {
      const params = new URLSearchParams({
        action: 'save_fact',
        category: 'AwayMode',
        key: 'away_active',
        value: active ? 'true' : 'false',
        details: JSON.stringify({ phoneNumbers, customMessage }),
        _t: Date.now()
      });
      await fetch(`${webAppUrl}?${params.toString()}`);
      console.log('[SheetsService] Away state synced to Sheets');
    } catch (err) {
      console.warn('[SheetsService] Away state sync failed:', err);
    }
  }

  /**
   * Load away mode state from Google Sheets.
   */
  static async loadAwayStateFromSheets() {
    const webAppUrl = SheetsService.getWebAppUrl();
    if (!webAppUrl) return SheetsService.getLocalAwayState();
    try {
      const params = new URLSearchParams({ action: 'get_away_state', _t: Date.now() });
      const response = await fetch(`${webAppUrl}?${params.toString()}`);
      const data = await response.json();
      if (data.status === 'success' && data.data) {
        const active = data.data.active === 'true';
        let details = {};
        try { details = JSON.parse(data.data.details || '{}'); } catch (_) {}
        const state = {
          active,
          phoneNumbers: Array.isArray(details.phoneNumbers) ? details.phoneNumbers : [],
          customMessage: details.customMessage || '',
        };
        SheetsService.saveLocalAwayState(state);
        return state;
      }
    } catch (err) {
      console.warn('[SheetsService] Load away state from Sheets failed:', err);
    }
    return SheetsService.getLocalAwayState();
  }
}
