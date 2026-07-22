/**
 * Intent Handler — Thin delegation wrapper for BrainEngine
 *
 * Maintains the exact same public API (IntentHandler.processInput)
 * so Dashboard.jsx and other consumers need zero changes.
 * All conversational logic is handled by BrainEngine.
 */

import { brainEngine } from './brainEngine';

export class IntentHandler {
  /**
   * Main entry point — delegates entirely to BrainEngine.
   * @param {string} rawInput
   * @param {Object} currentMemoryFacts
   * @param {Function} onStatusChange
   * @returns {Promise<{text: string, cardPayload?: Object, toolExecuted: boolean, toolLogs?: string[]}>}
   */
  static async processInput(rawInput, currentMemoryFacts = {}, onStatusChange = () => { }) {
    return brainEngine.processInput(rawInput, currentMemoryFacts, onStatusChange);
  }
}

