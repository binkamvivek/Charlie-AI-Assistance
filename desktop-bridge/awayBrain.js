/**
 * awayBrain — Lightweight Auto-Reply Engine for Away Mode
 *
 * Current: Simple static reply
 * Future: Full pattern-matched conversation engine (BrainEngine patterns)
 *
 * Architecture:
 *   processInput(incomingMessage, context) → { text: string } | null
 *   When non-null is returned, that reply is used.
 *   When null is returned, the fallback static message is used.
 *   This allows dropping in a full pattern engine later without changing
 *   any caller code.
 */

const DEFAULT_AWAY_MESSAGE =
  'Vivek is away at the moment, this is Charlie speaking. ' +
  'You can leave your message here, and Vivek will respond when he is back.';

/**
 * Process an incoming message during away mode.
 *
 * @param {string} incomingMessage - The raw message text received
 * @param {object} context - Optional conversation context (future use)
 * @returns {{ text: string } | null} A reply object, or null to use default
 */
export function processInput(incomingMessage, context = {}) {
  // TODO: Replace with full pattern matching (greetings, chitchat, jokes, etc.)
  // See brainEngine.js INTENT_CATEGORIES for the full pattern set.
  //
  // Example pattern to add later:
  //   if (/^(hello|hi|hey)\b/i.test(incomingMessage)) {
  //     return { text: 'Hello! Vivek is away right now...' };
  //   }
  //   if (/\b(bye|goodbye)\b/i.test(incomingMessage)) {
  //     return { text: 'Goodbye! I\'ll let Vivek know you messaged.' };
  //   }

  return null;
}

/**
 * Get the default away message.
 * Used as fallback when processInput returns null.
 */
export function getDefaultMessage() {
  return DEFAULT_AWAY_MESSAGE;
}
