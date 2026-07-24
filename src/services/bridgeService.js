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
}

