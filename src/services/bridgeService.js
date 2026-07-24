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
   * Detect if the app is running on a local/development environment
   * vs. a deployed cloud environment (Vercel, etc.).
   */
  static isLocalEnvironment() {
    if (typeof window === 'undefined') return false;
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  }

  /**
   * Check if the Desktop Bridge is reachable AND the environment is local.
   * Returns an object with { available, isLocal, error }.
   */
  static async checkBridgeAvailable() {
    const isLocal = this.isLocalEnvironment();
    if (!isLocal) {
      return {
        available: false,
        isLocal: false,
        error: 'Running in a deployed (cloud) environment. Desktop Bridge works only when running the app on your local machine.',
      };
    }
    const health = await this.checkHealth();
    if (health.status === 'offline') {
      return {
        available: false,
        isLocal: true,
        error: 'Desktop Bridge server is not running. Start it locally with: node desktop-bridge/server.js',
      };
    }
    return { available: true, isLocal: true, error: null };
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
      const response = await fetch(`${url}/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message })
      });
      let data;
      try {
        data = await response.json();
      } catch (parseErr) {
        return { success: false, error: 'Invalid response from Desktop Bridge server' };
      }
      if (data.success) {
        return { ...data, background: true };
      }
      return {
        success: false,
        error: data.error || 'Unknown error sending WhatsApp message',
        waStatus: data.waStatus || 'unknown',
        needsQr: data.waStatus === 'qr_needed',
      };
    } catch (err) {
      return {
        success: false,
        error: 'Could not connect to Desktop Bridge. Make sure it is running (node desktop-bridge/server.js).',
      };
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

  /**
   * Get WhatsApp QR code as base64 data URI for inline dashboard display
   */
  static async getWhatsAppQR() {
    const url = this.getBridgeUrl();
    try {
      const response = await fetch(`${url}/whatsapp/qr-data`, { method: 'GET' });
      return await response.json();
    } catch (e) {
      return { ready: false, waStatus: 'offline', qrDataUri: null, error: 'Bridge offline' };
    }
  }
}
