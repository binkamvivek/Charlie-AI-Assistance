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
   * Check if the Desktop Bridge server is reachable.
   * Returns an object with { available, error }.
   * Note: This works both locally and from deployed environments (Vercel, etc.)
   * because fetch to localhost always refers to the user's own machine.
   */
  static async checkBridgeAvailable() {
    const health = await this.checkHealth();
    if (health.status === 'offline') {
      return {
        available: false,
        error: 'Desktop Bridge server is not running on your local machine. To use system actions (opening apps, sending WhatsApp, etc.), start the helper server in your terminal:\n\nnode desktop-bridge/server.js\n\nThen try again once the server is running on port 3001.',
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
    // Try the dedicated background WhatsApp endpoint first (whatsapp-web.js)
    const url = this.getBridgeUrl();
    try {
      const response = await fetch(`${url}/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message })
      });
      const data = await response.json();
      if (data.success) {
        return { ...data, background: true };
      }
      // If WhatsApp client not ready, fallback to old method
      if (data.waStatus === 'qr_needed') {
        return {
          success: false,
          error: data.error,
          waStatus: 'qr_needed',
          needsQr: true,
        };
      }
      return data;
    } catch (err) {
      // Fallback to old execute method
      return this.executeCommand({ command: 'send_whatsapp', phone, message });
    }
  }

  /**
   * Check WhatsApp authentication status
   */
  static async getWhatsAppStatus() {
    const url = this.getBridgeUrl();
    try {
      const response = await fetch(`${url}/whatsapp/status`, { method: 'GET' });
      return await response.json();
    } catch (e) {
      return { status: 'offline', ready: false };
    }
  }
}
