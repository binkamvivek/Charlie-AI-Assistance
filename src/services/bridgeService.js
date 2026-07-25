/**
 * Bridge Service - Communicates with the local Desktop Command Helper server
 */

export class BridgeService {
  static getBridgeUrl() {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('charlie_bridge_url') || 'http://localhost:3001';
    }
    return 'http://localhost:3001';
  }

  /**
   * Check if the Desktop Bridge is reachable via HTTP fetch.
   * Works from any environment (localhost or deployed) as long as
   * the user has the bridge running on their machine.
   */
  static async checkBridgeAvailable() {
    const health = await this.checkHealth();
    if (health.status === 'offline') {
      return {
        available: false,
        error: 'Desktop Bridge server is not running. Start it with: node desktop-bridge/server.js',
      };
    }
    return { available: true, error: null };
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
   * Returns { success, sent, queued, waStatus, ... }
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
      return { flushed: false, error: err.message };
    }
  }

  /**
   * Poll WhatsApp status until ready, then call onReady callback.
   * @param {number} maxAttempts - Max polling attempts (default 300 = 10 min at 2s interval)
   * @param {number} intervalMs - Polling interval in ms (default 2000)
   * @param {Function} onReady - Called with { status: 'ready' } when WhatsApp is ready
   * @param {Function} onPoll - Optional callback each poll attempt
   * @returns {Promise<void>}
   */
  static async pollWhatsAppUntilReady(maxAttempts = 300, intervalMs = 2000, onReady = () => { }, onPoll = () => { }) {
    const url = this.getBridgeUrl();
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`${url}/whatsapp/status`);
        const data = await response.json();
        onPoll(data);
        if (data.ready) {
          onReady({ status: 'ready' });
          return;
        }
      } catch (e) {
        // Bridge might be temporarily unreachable
        onPoll({ status: 'poll_error', error: e.message });
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    // Timeout
    onReady({ status: 'timeout', error: `WhatsApp did not become ready after ${(maxAttempts * intervalMs) / 1000} seconds` });
  }
}

