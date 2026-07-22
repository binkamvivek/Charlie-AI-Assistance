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
}
