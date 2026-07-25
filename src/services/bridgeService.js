/**
 * Bridge Service - Communicates with the local Desktop Command Helper server
 */

export class BridgeService {
  static getBridgeUrl() {
    // Priority: localStorage override > env var > default
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('charlie_bridge_url');
      if (stored) return stored;
    }
    try {
      if (typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_BRIDGE_URL) {
        return import.meta.env.PUBLIC_BRIDGE_URL;
      }
    } catch (_) { /* import.meta not available in some contexts */ }
    return 'http://localhost:3001';
  }

  /**
   * Check if the Desktop Bridge is reachable via HTTP fetch.
   */
  static async checkBridgeAvailable() {
    const health = await this.checkHealth();
    if (health.status === 'offline') {
      return {
        available: false,
        error: 'Desktop Bridge server is not running. Start it with: node desktop-bridge/server.js',
        waStatus: null,
      };
    }
    return {
      available: true,
      error: null,
      waStatus: health.waStatus || 'unknown',
      queueLength: health.queueLength || 0,
    };
  }

  static async checkHealth() {
    const url = this.getBridgeUrl();
    try {
      const response = await fetch(`${url}/health`, { method: 'GET' });
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      return { status: 'offline' };
    }
    return { status: 'offline' };
  }

  static async executeCommand(payload) {
    const url = this.getBridgeUrl();
    try {
      const response = await fetch(`${url}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await response.json();
    } catch (err) {
      console.error('Desktop Bridge execution error:', err);
      return { success: false, error: 'Could not connect to Desktop Helper server at ' + url };
    }
  }

  static async launchApp(appName) {
    return this.executeCommand({ command: 'launch_app', target: appName });
  }

  static async draftEmail({ to, subject, body }) {
    return this.executeCommand({ command: 'draft_email', to, subject, body });
  }

  static async getSystemStatus() {
    return this.executeCommand({ command: 'system_status' });
  }

  static async sendWhatsApp(phone, message) {
    const url = this.getBridgeUrl();
    try {
      const response = await fetch(`${url}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'send_whatsapp', phone, message })
      });
      let data;
      try {
        data = await response.json();
      } catch (parseErr) {
        return { success: false, error: 'Invalid response from Desktop Bridge server' };
      }
      return data;
    } catch (err) {
      return {
        success: false,
        error: 'Could not connect to Desktop Bridge. Make sure it is running (node desktop-bridge/server.js).',
      };
    }
  }

  /**
   * Send WhatsApp message OR queue it if not authenticated.
   */
  static async sendWhatsAppOrQueue(phone, message) {
    const url = this.getBridgeUrl();
    try {
      const response = await fetch(`${url}/whatsapp/send-or-queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message })
      });
      return await response.json();
    } catch (err) {
      return {
        success: false,
        error: 'Could not connect to Desktop Bridge. Make sure it is running (node desktop-bridge/server.js).',
      };
    }
  }

  /**
   * Flush the message queue on the bridge (send all queued messages).
   */
  static async flushWhatsAppQueue() {
    const url = this.getBridgeUrl();
    try {
      const response = await fetch(`${url}/whatsapp/queue/flush`, { method: 'POST' });
      return await response.json();
    } catch (err) {
      return { flushed: false, sent: 0, error: err.message };
    }
  }

  /**
   * Get the current queue status from the bridge.
   */
  static async getWhatsAppQueue() {
    const url = this.getBridgeUrl();
    try {
      const response = await fetch(`${url}/whatsapp/queue`);
      return await response.json();
    } catch (err) {
      return { queueLength: 0, messages: [], error: err.message };
    }
  }

  /**
   * Poll WhatsApp status until ready, then flush queue and call onReady.
   * Also calls onPoll callback each poll iteration.
   * 
   * @param {number} maxAttempts - Max polling attempts (default 300 = 10 min at 2s interval)
   * @param {number} intervalMs - Polling interval in ms (default 2000)
   * @param {Function} onReady - Called with { status: 'ready' } when WhatsApp is ready
   * @param {Function} onPoll - Optional callback each poll attempt
   * @returns {Promise<Object>} Result object with status
   */
  static async pollWhatsAppUntilReady(maxAttempts = 300, intervalMs = 2000, onReady = () => { }, onPoll = () => { }) {
    const url = this.getBridgeUrl();
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`${url}/whatsapp/status`);
        const data = await response.json();
        onPoll(data);
        if (data.ready) {
          // WhatsApp is now ready! Flush any queued messages
          try {
            const flushResult = await this.flushWhatsAppQueue();
            console.log('[BridgeService] Queue flush result:', flushResult);
          } catch (flushErr) {
            console.warn('[BridgeService] Failed to flush queue after ready:', flushErr);
          }
          onReady({ status: 'ready' });
          return { status: 'ready' };
        }
      } catch (e) {
        onPoll({ status: 'poll_error', error: e.message });
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    const timeoutResult = { status: 'timeout', error: `WhatsApp did not become ready after ${(maxAttempts * intervalMs) / 1000} seconds` };
    onReady(timeoutResult);
    return timeoutResult;
  }
}
