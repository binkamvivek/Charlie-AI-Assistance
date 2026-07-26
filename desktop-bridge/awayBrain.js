/**
 * awayBrain — Intelligent Away Conversation Engine
 *
 * Per-sender state machine that manages an adaptive conversation flow
 * when Vivek is away on WhatsApp. Handles:
 *   - Multi-turn conversation with 6 states
 *   - Smart message classification (answer, question, chitchat, etc.)
 *   - 2-minute inactivity timeout detection
 *   - Off-topic tracking with adaptive responses
 *   - Media message handling (images, videos, etc.)
 *   - Session persistence with 24h cleanup
 *
 * Each session is keyed by WhatsApp chat ID (senderId).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes inactivity → notify
const AUTO_CLOSE_MS = 7 * 60 * 1000; // 7 minutes total inactivity → auto close
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h max session lifetime
const MAX_OFF_TOPIC = 5; // After this, force wrap-up
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // Clean up old sessions every 30min

const DEFAULT_SHEETS_URL = '';

// ---------------------------------------------------------------------------
// State Definitions
// ---------------------------------------------------------------------------
const STATES = {
  INITIAL: 'INITIAL',
  AWAITING_MESSAGE: 'AWAITING_MESSAGE',
  AWAITING_REASON: 'AWAITING_REASON',
  AWAITING_URGENCY: 'AWAITING_URGENCY',
  AWAITING_UPDATES: 'AWAITING_UPDATES',
  AWAITING_PERSONAL: 'AWAITING_PERSONAL',
  COMPLETE: 'COMPLETE',
  TIMED_OUT: 'TIMED_OUT',
};

const STATE_LABELS = {
  INITIAL: 'Greeting',
  AWAITING_MESSAGE: 'Collecting message',
  AWAITING_REASON: 'Asking reason',
  AWAITING_URGENCY: 'Asking urgency',
  AWAITING_UPDATES: 'Asking about updates',
  AWAITING_PERSONAL: 'Checking on them',
  COMPLETE: 'Complete',
  TIMED_OUT: 'Timed out',
};

// ---------------------------------------------------------------------------
// Session Store
// ---------------------------------------------------------------------------
class AwayBrain {
  constructor() {
    this.sessions = new Map();
    this.sheetsUrl = DEFAULT_SHEETS_URL;

    // Periodic cleanup
    if (typeof setInterval === 'function') {
      setInterval(() => this._cleanupOldSessions(), CLEANUP_INTERVAL_MS);
    }
  }

  setSheetsUrl(url) {
    this.sheetsUrl = url || DEFAULT_SHEETS_URL;
  }

  // =========================================================================
  // MAIN ENTRY: process an incoming text message
  // =========================================================================
  processInput(text, senderId, options = {}) {
    const phone = options.phone || senderId.split('@')[0] || '';
    let session = this.sessions.get(senderId);

    // Detect timeout gap on arrival of new message
    if (session && session.state !== STATES.COMPLETE && session.state !== STATES.TIMED_OUT) {
      const gap = Date.now() - session.lastActivity;
      if (gap >= TIMEOUT_MS && session.state !== STATES.INITIAL) {
        if (!session.timeoutNotified) {
          session.timeoutNotified = true;
          session.lastActivity = Date.now();
          const reply = this._handleTimeoutNotice(session, senderId);
          this._logStep(session, senderId, phone, 'charlie', reply, session.state);
          return { reply, sessionState: session.state, sessionId: this._makeSessionId(senderId) };
        }
        if (gap >= AUTO_CLOSE_MS) {
          return this._closeSession(session, senderId, phone, 'timed_out');
        }
      }
    }

    // Ensure session exists
    if (!session) {
      session = this._createSession(senderId, phone);
      this.sessions.set(senderId, session);
    }

    session.lastActivity = Date.now();
    if (session.timeoutNotified) {
      session.timeoutNotified = false;
    }

    // If session is complete or timed out, just acknowledge politely
    if (session.state === STATES.COMPLETE || session.state === STATES.TIMED_OUT) {
      this._logStep(session, senderId, phone, 'sender', text, session.state, 'post_complete');
      const reply = this._handlePostCompletion(text, session);
      this._logStep(session, senderId, phone, 'charlie', reply, session.state);
      this._saveToSheets(session, senderId, phone);
      return { reply, sessionState: session.state, sessionId: this._makeSessionId(senderId) };
    }

    // SPECIAL: INITIAL state — always send greeting prompt regardless of input
    if (session.state === STATES.INITIAL) {
      session.state = STATES.AWAITING_MESSAGE;
      const greeting = this._getGreeting();
      const prompt = this._getPrompt(STATES.AWAITING_MESSAGE);
      const reply = greeting + '\n\n' + prompt;
      this._logStep(session, senderId, phone, 'sender', text, 'INITIAL', 'first_contact');
      this._logStep(session, senderId, phone, 'charlie', reply, 'AWAITING_MESSAGE');
      this._saveToSheets(session, senderId, phone);
      return { reply, sessionState: 'AWAITING_MESSAGE', sessionId: this._makeSessionId(senderId) };
    }

    // Classify the message
    const classification = this._classifyMessage(text, session.state);

    // Log the incoming message
    this._logStep(session, senderId, phone, 'sender', text, session.state, classification.type);

    let reply = '';

    switch (classification.type) {
      case 'farewell':
        reply = this._handleFarewell(session, senderId, phone);
        break;

      case 'greeting':
        reply = this._handleGreeting(session, text);
        break;

      case 'question_back':
        reply = this._handleQuestionBack(session, text);
        break;

      case 'question_vivek':
        reply = this._handleQuestionVivek(session, text);
        break;

      case 'answer':
        reply = this._handleAnswer(session, senderId, phone, text, classification.details);
        break;

      case 'continuation':
        reply = this._handleContinuation(session, senderId, phone, text);
        break;

      case 'chitchat':
        reply = this._handleChitchat(session, text);
        break;

      case 'potential_answer':
        reply = this._handlePotentialAnswer(session, senderId, phone, text);
        break;

      case 'random':
      default:
        reply = this._handleRandom(session, text);
        break;
    }

    if (!reply) {
      reply = this._handleRandom(session, text);
    }

    this._logStep(session, senderId, phone, 'charlie', reply, session.state);

    // Save to sheets periodically
    this._saveToSheets(session, senderId, phone);

    return { reply, sessionState: session.state, sessionId: this._makeSessionId(senderId) };
  }

  // =========================================================================
  // MEDIA HANDLER — for non-text messages
  // =========================================================================
  handleMedia(mediaType, caption, senderId, options = {}) {
    const phone = options.phone || senderId.split('@')[0] || '';
    let session = this.sessions.get(senderId);

    if (!session) {
      session = this._createSession(senderId, phone);
      this.sessions.set(senderId, session);
    }

    session.lastActivity = Date.now();

    const mediaLabel = this._getMediaLabel(mediaType);
    let reply = this._getMediaReply(mediaType, session.state);

    // Log the media message
    const mediaText = caption ? `[${mediaLabel}: ${caption}]` : `[${mediaLabel}]`;
    this._logStep(session, senderId, phone, 'sender', mediaText, session.state, `media_${mediaType}`);
    this._logStep(session, senderId, phone, 'charlie', reply, session.state);

    // If there's a caption and we're in AWAITING_MESSAGE state, treat it as their message
    if (caption && session.state === STATES.AWAITING_MESSAGE) {
      session.collectedData.message = caption;
      const captionNote = ` (I also noticed you added a note: "${caption}")`;
      session.state = STATES.AWAITING_REASON;
      reply = reply + captionNote + ' ' + this._getPrompt(STATES.AWAITING_REASON);
      this._logStep(session, senderId, phone, 'charlie', reply, session.state);
    }

    this._saveToSheets(session, senderId, phone);

    return { reply, sessionState: session.state, sessionId: this._makeSessionId(senderId) };
  }

  // =========================================================================
  // TIMEOUT CHECK — for periodic polling
  // =========================================================================
  checkTimeouts() {
    const timedOut = [];
    const now = Date.now();

    for (const [senderId, session] of this.sessions.entries()) {
      if (session.state === STATES.COMPLETE || session.state === STATES.TIMED_OUT) continue;
      if (session.state === STATES.INITIAL) continue;

      const inactiveFor = now - session.lastActivity;

      if (inactiveFor >= AUTO_CLOSE_MS && !session.timeoutNotified) {
        // They never responded to the timeout notice, close
        const result = this._closeSession(session, senderId, session.collectedData.phone || '', 'timed_out');
        timedOut.push({ senderId, ...result });
      } else if (inactiveFor >= TIMEOUT_MS && !session.timeoutNotified) {
        // First timeout — notify
        const reply = this._handleTimeoutNotice(session, senderId);
        session.timeoutNotified = true;
        this._logStep(session, senderId, session.collectedData.phone || '', 'charlie', reply, session.state);
        timedOut.push({ senderId, reply, sessionState: session.state, sessionId: this._makeSessionId(senderId) });
      }
    }

    return timedOut;
  }

  // =========================================================================
  // GETTERS
  // =========================================================================
  getSession(senderId) {
    const s = this.sessions.get(senderId);
    if (!s) return null;
    return this._sanitizeSession(s);
  }

  getAllConversations() {
    const result = [];
    for (const [senderId, session] of this.sessions.entries()) {
      result.push(this._sanitizeSession(session));
    }
    return result;
  }

  getConversationCount() {
    return this.sessions.size;
  }

  resetSession(senderId) {
    this.sessions.delete(senderId);
  }

  // =========================================================================
  // === PRIVATE METHODS ===
  // =========================================================================

  // -------------------------------------------------------------------------
  // MESSAGE CLASSIFIER
  // -------------------------------------------------------------------------
  _classifyMessage(text, currentState) {
    const lower = text.toLowerCase().trim();
    const input = text.trim();

    if (!input || input.length < 2) {
      return { type: 'random' };
    }

    // Farewell detection
    if (/^(bye|goodbye|see you|see ya|cya|later|gotta go|i'?m off|peace out|night|goodnight)\b/i.test(lower)) {
      return { type: 'farewell' };
    }

    // Greeting detection
    if (/^(hello|hi|hey|greetings|howdy|yo|sup|good morning|good afternoon|good evening|heyy|heya)\b/i.test(lower)) {
      return { type: 'greeting' };
    }

    // Question back — about Charlie
    if (/^(who are you|what are you|what is this|are you (real|ai|a bot|human)|are you chatgpt|is this a bot|who is charlie)\b/i.test(lower) ||
        (/\b(who (are|is)|what (are|is)).{0,30}(you|this|charlie)\b/i.test(lower) && /\b(you|charlie)\b/i.test(lower))) {
      return { type: 'question_back' };
    }

    // Question about Vivek — must be an actual question, not just mentioning him
    if (/^(where|when|how long|is|will|can|does)\b.{0,30}?(vivek|he|him)\b/i.test(lower) ||
        /\b(vivek)\b.{0,20}?\b(where|when|how long|back|return|away|gone|available|reach|contact|coming)\b/i.test(lower) ||
        /^(where|when|how long)\s+.{0,30}?\b(back|return|away|gone)\b/i.test(lower)) {
      return { type: 'question_vivek' };
    }

    // Chitchat detection — check BEFORE direct answer to prevent "tell me a joke" being treated as answer
    if (/^(tell|say|give|crack|hit).{0,20}(joke|fun fact|story|quote|riddle|trivia)\b/i.test(lower) ||
        /\b(joke|funny|laugh|make me laugh)\b/i.test(lower) ||
        /^i'?m\s+(bored|tired|hungry|sleepy|thirsty|lazy)\b/i.test(lower) ||
        /\b(weather|rain|sunny|cold|hot|temperature)\b/i.test(lower) ||
        /^(how are you|how's it going|what's up|how do you do|how is it going)\b/i.test(lower)) {
      return { type: 'chitchat' };
    }

    // Short filler words with no substance
    if (/^(ok|okay|k|kk|sure|fine|alright|right|yeah|yep|yup|nah|nope|hmm|huh|oh|ah|hey|um|er)\s*$/i.test(lower)) {
      return { type: 'chitchat' };
    }

    // Gratitude that's not an answer
    if (/^(thanks|thank you|thx|ty|appreciate it|thanks a lot)\s*$/i.test(lower)) {
      return { type: 'chitchat' };
    }

    // Continuation patterns (adding more to previous answer)
    if (/^(also|and|plus|oh|one more|also tell|and also|wait|actually|another thing|also one more)\b/i.test(lower)) {
      return { type: 'continuation' };
    }

    // Check for direct answers based on current state
    const answerCheck = this._checkDirectAnswer(input, lower, currentState);
    if (answerCheck) {
      return { type: 'answer', details: answerCheck };
    }

    // Anything else could be an answer or off-topic — treat as potential answer
    return { type: 'potential_answer' };
  }

  // -------------------------------------------------------------------------
  // PER-STATE ANSWER CHECKING
  // -------------------------------------------------------------------------
  _checkDirectAnswer(input, lower, state) {
    switch (state) {
      case STATES.INITIAL:
        // Almost anything is an answer to the initial greeting
        return { matched: true, extracted: input };

      case STATES.AWAITING_MESSAGE:
        // Any substantive text is a message for Vivek
        if (input.length >= 3) {
          return { matched: true, extracted: input };
        }
        return null;

      case STATES.AWAITING_REASON:
        // Look for reason indicators
        if (/^(because|it'?s about|just|wanted|need|regarding|for|about)\b/i.test(lower)) {
          return { matched: true, extracted: input };
        }
        // Common reason-like answers
        if (/^(work|personal|family|urgent|important|quick|checking|just checking|catching up|hello|introduction|follow.up|update|question|problem|issue|help|request|feedback)\b/i.test(lower)) {
          return { matched: true, extracted: input };
        }
        // A longer message is likely a reason
        if (input.split(/\s+/).length >= 3) {
          return { matched: true, extracted: input };
        }
        return null;

      case STATES.AWAITING_URGENCY:
        if (/^(yes|yeah|yep|yup|definitely|absolutely|very|urgent|extremely)\b/i.test(lower)) {
          return { matched: true, extracted: 'urgent' };
        }
        if (/^(no|nah|nope|not|not urgent|not really|no rush|whenever|can wait|not at all)\b/i.test(lower)) {
          return { matched: true, extracted: 'not urgent' };
        }
        if (/^(kind of|sort of|maybe|somewhat|a little|kinda|depends|moderate|medium|could be)\b/i.test(lower)) {
          return { matched: true, extracted: 'somewhat urgent' };
        }
        if (/^(i don'?t know|not sure|unsure|maybe|perhaps)\b/i.test(lower)) {
          return { matched: true, extracted: 'not sure' };
        }
        // One-word answers
        if (/^(urgent|important|critical|emergency|asap|soon|quick)\b/i.test(lower) && input.split(/\s+/).length <= 3) {
          return { matched: true, extracted: 'urgent' };
        }
        return null;

      case STATES.AWAITING_UPDATES:
        if (/^(no|nah|nope|nothing|not really|all good|all set|that'?s it|that'?s all|i'?m good|no updates|nothing new|none)\b/i.test(lower)) {
          return { matched: true, extracted: 'Nothing new' };
        }
        if (/^(yes|yeah|actually|well)\b/i.test(lower) || input.split(/\s+/).length >= 3) {
          return { matched: true, extracted: input };
        }
        // Short noun-like answers that could be updates
        if (/^(work|project|deadline|meeting|call|event|news|update|change|something|stuff)\b/i.test(lower)) {
          return { matched: true, extracted: input };
        }
        return null;

      case STATES.AWAITING_PERSONAL:
        if (/^(good|great|fine|okay|alright|not bad|doing well|awesome|amazing|wonderful|excellent|fantastic|happy|blessed)\b/i.test(lower)) {
          return { matched: true, extracted: 'doing well' };
        }
        if (/^(bad|not good|rough|tough|difficult|hard|struggling|stressed|tired|exhausted|busy|hectic|overwhelmed|sad|down|anxious|worried)\b/i.test(lower)) {
          return { matched: true, extracted: 'struggling' };
        }
        if (/^(okay|ok|so.so|alright|managing|surviving|hanging in|getting by|could be worse)\b/i.test(lower)) {
          return { matched: true, extracted: 'managing' };
        }
        if (input.split(/\s+/).length >= 2) {
          return { matched: true, extracted: input };
        }
        return null;

      case STATES.COMPLETE:
      case STATES.TIMED_OUT:
        return null;

      default:
        return null;
    }
  }

  // -------------------------------------------------------------------------
  // STATE HANDLERS
  // -------------------------------------------------------------------------

  _getPrompt(state) {
    const prompts = {
      [STATES.AWAITING_MESSAGE]: 'What would you like to tell Vivek?',
      [STATES.AWAITING_REASON]: 'Could you tell me the reason you\'re reaching out?',
      [STATES.AWAITING_URGENCY]: 'Is this urgent? (Yes / No / Kind of)',
      [STATES.AWAITING_UPDATES]: 'Is there anything new or important Vivek should know about?',
      [STATES.AWAITING_PERSONAL]: 'And how are you doing? Everything okay on your end?',
    };
    return prompts[state] || '';
  }

  _getGreeting() {
    const greetings = [
      'Vivek is away at the moment, this is Charlie speaking. You can leave your message here, and Vivek will respond when he is back.',
      'Hi there! Vivek is currently away. I\'m Charlie, his assistant. You can leave a message and he\'ll get back to you.',
      'Vivek is not available right now. I\'m Charlie, and I can take a message for you. Vivek will respond as soon as he\'s back.',
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  _handleGreeting(session, text) {
    const responses = [
      'Hello again! Let\'s pick up where we left off. ' + this._getPrompt(session.state),
      'Hi! Good to hear from you. ' + this._getPrompt(session.state),
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  _handleQuestionBack(session, text) {
    const lower = text.toLowerCase();
    let answerAboutCharlie = '';

    if (/\b(who are you|what are you)\b/i.test(lower)) {
      answerAboutCharlie = 'I\'m Charlie — Vivek\'s AI assistant. I help manage messages and tasks while he\'s away. Think of me as his digital receptionist!';
    } else if (/\b(are you .{0,10}(real|ai|bot|human|chatgpt))\b/i.test(lower)) {
      answerAboutCharlie = 'I\'m a locally-running AI assistant — no cloud, no API keys. Just a helpful program that Vivek built to assist while he\'s away.';
    } else if (/\b(is this a bot|are you a bot|you a bot)\b/i.test(lower)) {
      answerAboutCharlie = 'Yes, I\'m an automated assistant — but a friendly one! I\'m here to help while Vivek is unavailable.';
    } else if (/\b(who is charlie|what is charlie)\b/i.test(lower)) {
      answerAboutCharlie = 'Charlie is me! I\'m the AI assistant running on Vivek\'s local machine. I handle messages, commands, and keep things running smoothly.';
    } else {
      answerAboutCharlie = 'I\'m Charlie, Vivek\'s AI assistant! I\'m here to help while he\'s away.';
    }

    session.offTopicCount++;
    if (session.offTopicCount >= MAX_OFF_TOPIC) {
      return answerAboutCharlie + ' I\'ll make sure Vivek gets your messages. Feel free to tell me whatever you\'d like him to know!';
    }
    const qPrompt = this._getPrompt(session.state);
    return answerAboutCharlie + ' Now, ' + qPrompt.charAt(0).toLowerCase() + qPrompt.slice(1);
  }

  _handleQuestionVivek(session, text) {
    const answers = [
      'Vivek is currently away and will be back soon. I\'m here to take messages for him in the meantime! ' + this._getPrompt(session.state),
      'He\'s unavailable right now, but I\'ll make sure he gets your message when he returns. ' + this._getPrompt(session.state),
      'Vivek will be back shortly! In the meantime, feel free to leave a message. ' + this._getPrompt(session.state),
    ];
    session.offTopicCount++;
    if (session.offTopicCount >= MAX_OFF_TOPIC) {
      return answers[0].replace(this._getPrompt(session.state), 'I\'ll just make sure Vivek sees everything you send.');
    }
    return answers[Math.floor(Math.random() * answers.length)];
  }

  _handleFarewell(session, senderId, phone) {
    return this._closeSession(session, senderId, phone, 'complete').reply;
  }

  _handleAnswer(session, senderId, phone, text, details) {
    switch (session.state) {
      case STATES.INITIAL:
      case STATES.AWAITING_MESSAGE:
        session.collectedData.message = details.extracted || text;
        session.state = STATES.AWAITING_REASON;
        return 'Got it, I\'ll make sure Vivek sees that!' + (text.length > 50 ? '' : '') + ' ' + this._getPrompt(STATES.AWAITING_REASON);

      case STATES.AWAITING_REASON:
        session.collectedData.reason = details.extracted || text;
        session.state = STATES.AWAITING_URGENCY;
        return 'I understand. ' + this._getPrompt(STATES.AWAITING_URGENCY);

      case STATES.AWAITING_URGENCY:
        session.collectedData.urgency = details.extracted || text;
        session.state = STATES.AWAITING_UPDATES;
        return 'Good to know. ' + this._getPrompt(STATES.AWAITING_UPDATES);

      case STATES.AWAITING_UPDATES:
        session.collectedData.updates = details.extracted || text;
        session.state = STATES.AWAITING_PERSONAL;
        return 'I\'ll log that!' + ' ' + this._getPrompt(STATES.AWAITING_PERSONAL);

      case STATES.AWAITING_PERSONAL:
        session.collectedData.personal = details.extracted || text;
        return this._completeSession(session, senderId, phone);

      default:
        return this._getPrompt(session.state);
    }
  }

  _handleContinuation(session, senderId, phone, text) {
    // Append to whatever the last collected field was
    const currentKey = this._getCurrentDataKey(session.state);
    if (currentKey && session.collectedData[currentKey]) {
      session.collectedData[currentKey] += ' ' + text;
    } else if (currentKey) {
      session.collectedData[currentKey] = text;
    }

    // Stay in same state, acknowledge
    const acknowledgments = [
      'Got it, noted! ' + this._getPrompt(session.state),
      'Added to the message! ' + this._getPrompt(session.state),
      'I\'ve included that. ' + this._getPrompt(session.state),
    ];
    return acknowledgments[Math.floor(Math.random() * acknowledgments.length)];
  }

  _handleChitchat(session, text) {
    const lower = text.toLowerCase();
    let reply = '';

    if (/\b(joke|funny|laugh)\b/i.test(lower)) {
      const jokes = [
        'Why don\'t scientists trust atoms? Because they make up everything!',
        'Why did the scarecrow win an award? He was outstanding in his field!',
        'What do you call a fake noodle? An impasta!',
      ];
      reply = jokes[Math.floor(Math.random() * jokes.length)];
    } else if (/\b(weather|rain|sunny|cold|hot)\b/i.test(lower)) {
      reply = 'I wish I could experience weather! But I\'m just code. 😊';
    } else if (/^(how are you|how's it going|what's up)\b/i.test(lower)) {
      reply = 'I\'m doing great, thanks for asking! Just here helping while Vivek is away.';
    } else if (/^i'?m\s+(bored|tired|hungry|sleepy)\b/i.test(lower)) {
      reply = 'I hear you! Hope things pick up soon. 😊';
    } else if (/^(thanks|thank you|thx|ty|appreciate)\b/i.test(lower)) {
      reply = 'You\'re welcome! Happy to help. 😊';
    } else if (/\b(ok|okay|k|sure|fine|alright|yeah|yep)\b/i.test(lower)) {
      reply = 'Great!';
    } else {
      reply = 'Interesting!';
    }

    session.offTopicCount++;
    if (session.offTopicCount >= MAX_OFF_TOPIC) {
      return reply + ' Anyway, I\'ll just make sure Vivek gets whatever you\'d like to share with him. Feel free to tell me anything for him!';
    }

    const cPrompt = this._getPrompt(session.state);
    return reply + ' So, ' + cPrompt.charAt(0).toLowerCase() + cPrompt.slice(1);
  }

  _handlePotentialAnswer(session, senderId, phone, text) {
    // This might be an off-topic message or a poorly-worded answer
    // Try to extract useful info, or guide back

    // If text is very short and we're not in AWAITING_MESSAGE, it's probably not an answer
    if (text.split(/\s+/).length <= 2 && session.state !== STATES.AWAITING_MESSAGE) {
      session.offTopicCount++;
      if (session.offTopicCount >= MAX_OFF_TOPIC) {
        return 'I\'ll make sure Vivek sees everything. Is there anything specific you\'d like me to pass along to him?';
      }
      const rephrasePrompt = this._getRephrasedPrompt(session.state);
      return rephrasePrompt;
    }

    // Longer text — treat as their answer
    return this._handleAnswer(session, senderId, phone, text, { matched: true, extracted: text });
  }

  _handleRandom(session, text) {
    session.offTopicCount++;
    if (session.offTopicCount >= MAX_OFF_TOPIC) {
      return 'I\'ll just make sure Vivek gets your messages. Feel free to share whatever you\'d like him to know!';
    }
    return 'I see! ' + this._getRephrasedPrompt(session.state);
  }

  _handleTimeoutNotice(session, senderId) {
    const responses = [
      'Hey, I noticed you stepped away. I\'ve saved what you\'ve shared so far. If you\'re still here, just reply and we\'ll continue. Otherwise, Vivek will get back to you!',
      'It\'s been a couple of minutes — just checking in! I\'ve noted what you\'ve shared. If you\'re still around, just send a message and we can keep going. If not, no worries — Vivek will see your messages when he\'s back.',
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  _getRephrasedPrompt(state) {
    const rephrased = {
      [STATES.AWAITING_MESSAGE]: 'What message would you like me to pass along to Vivek?',
      [STATES.AWAITING_REASON]: 'What\'s the reason you\'re reaching out to Vivek?',
      [STATES.AWAITING_URGENCY]: 'Would you say this is urgent or can it wait?',
      [STATES.AWAITING_UPDATES]: 'Anything new you\'d like Vivek to know about?',
      [STATES.AWAITING_PERSONAL]: 'How are things on your end? Everything okay?',
    };
    return rephrased[state] || 'Could you tell me more about that?';
  }

  // -------------------------------------------------------------------------
  // COMPLETION & CLOSE
  // -------------------------------------------------------------------------

  _completeSession(session, senderId, phone) {
    session.state = STATES.COMPLETE;
    const summary = this._buildSummary(session);

    this._saveToSheets(session, senderId, phone);
    this._saveConversationToSheets(session, senderId, phone, 'complete');

    return summary;
  }

  _closeSession(session, senderId, phone, reason) {
    session.state = reason === 'timed_out' ? STATES.TIMED_OUT : STATES.COMPLETE;

    let reply = '';
    if (reason === 'timed_out') {
      reply = 'I\'ve saved everything you\'ve shared so far. Vivek will check in when he\'s back. Take care! 👋';
    } else {
      reply = this._buildSummary(session);
    }

    this._saveConversationToSheets(session, senderId, phone, reason);

    return { reply, sessionState: session.state, sessionId: this._makeSessionId(senderId) };
  }

  _buildSummary(session) {
    const data = session.collectedData;
    let summary = 'Thank you! I\'ve logged everything for Vivek.\n\n';

    if (data.message) summary += '📝 Message: ' + data.message + '\n';
    if (data.reason) summary += '📋 Reason: ' + data.reason + '\n';
    if (data.urgency) summary += '⚡ Urgency: ' + data.urgency + '\n';
    if (data.updates && data.updates !== 'Nothing new') summary += '🆕 Updates: ' + data.updates + '\n';
    if (data.personal) summary += '💬 How you\'re doing: ' + data.personal + '\n';

    summary += '\nHe\'ll check in as soon as he\'s back. Take care! 👋';
    return summary;
  }

  _handlePostCompletion(text, session) {
    const lower = text.toLowerCase().trim();
    if (/^(bye|goodbye|see you|thanks|thank you|ok|okay)\b/i.test(lower)) {
      const farewells = [
        'You\'re welcome! Have a great day! 😊',
        'Take care! Vivek will be in touch when he\'s back. 👋',
        'My pleasure! Have a good one! 😊',
      ];
      return farewells[Math.floor(Math.random() * farewells.length)];
    }
    const responses = [
      'Noted! I\'ve added that to your conversation.',
      'Got it! I\'ll make sure Vivek sees that too.',
      'Thanks for sharing! I\'ve included that in the message.',
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // -------------------------------------------------------------------------
  // MEDIA HELPERS
  // -------------------------------------------------------------------------

  _getMediaLabel(type) {
    const labels = {
      image: 'IMAGE',
      video: 'VIDEO',
      gif: 'GIF',
      audio: 'AUDIO',
      document: 'DOCUMENT',
      sticker: 'STICKER',
      ptt: 'VOICE NOTE',
    };
    return labels[type] || 'MEDIA';
  }

  _getMediaReply(type, currentState) {
    const replies = {
      image: [
        'Thanks for the image! Only Vivek can see this — he\'ll check it when he\'s back.',
        'Picture received! Vivek will take a look when he returns.',
      ],
      video: [
        'Video received! Vivek will watch this when he\'s back.',
        'Got your video! Only Vivek can see this — he\'ll check it when he returns.',
      ],
      gif: [
        'Nice GIF! 😊 Vivek will see this when he\'s back.',
        'Haha, love it! Vivek will check this out later.',
      ],
      audio: [
        'Audio received! Vivek will listen to this when he\'s back.',
        'Voice note received! Vivek will hear it when he returns.',
      ],
      document: [
        'File received! Vivek will review this when he\'s back.',
        'Document saved! Only Vivek can see this — he\'ll check it when he returns.',
      ],
      sticker: [
        'Nice sticker! 😊 Vivek will see it when he returns.',
        'Sticker received! 😄',
      ],
      ptt: [
        'Voice message received! Vivek will listen to this when he\'s back.',
        'Got your voice note! Only Vivek can hear this — he\'ll check it when he returns.',
      ],
    };

    const typeReplies = replies[type] || [
      'Media received! Only Vivek can see this — he\'ll check it when he\'s back.',
    ];

    return typeReplies[Math.floor(Math.random() * typeReplies.length)];
  }

  // -------------------------------------------------------------------------
  // SESSION MANAGEMENT
  // -------------------------------------------------------------------------

  _createSession(senderId, phone) {
    return {
      senderId,
      phone,
      state: STATES.INITIAL,
      collectedData: { message: '', reason: '', urgency: '', updates: '', personal: '' },
      conversationLog: [],
      offTopicCount: 0,
      lastActivity: Date.now(),
      startedAt: Date.now(),
      timeoutNotified: false,
    };
  }

  _makeSessionId(senderId) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const shortId = senderId.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
    return `away_${shortId}_${date}`;
  }

  _getCurrentDataKey(state) {
    const map = {
      [STATES.AWAITING_MESSAGE]: 'message',
      [STATES.AWAITING_REASON]: 'reason',
      [STATES.AWAITING_URGENCY]: 'urgency',
      [STATES.AWAITING_UPDATES]: 'updates',
      [STATES.AWAITING_PERSONAL]: 'personal',
    };
    return map[state] || null;
  }

  _sanitizeSession(session) {
    return {
      senderId: session.senderId,
      phone: session.phone,
      state: session.state,
      stateLabel: STATE_LABELS[session.state] || session.state,
      collectedData: { ...session.collectedData },
      conversationLog: [...session.conversationLog],
      offTopicCount: session.offTopicCount,
      lastActivity: session.lastActivity,
      startedAt: session.startedAt,
      timeoutNotified: session.timeoutNotified,
    };
  }

  _cleanupOldSessions() {
    const now = Date.now();
    for (const [senderId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > SESSION_TTL_MS) {
        // Auto-save before deleting
        this._saveConversationToSheets(session, senderId, session.phone, 'expired');
        this.sessions.delete(senderId);
      }
    }
  }

  // -------------------------------------------------------------------------
  // LOGGING & PERSISTENCE
  // -------------------------------------------------------------------------

  _logStep(session, senderId, phone, role, text, state, classification) {
    session.conversationLog.push({
      timestamp: new Date().toISOString(),
      role,
      text,
      state,
      classification: classification || 'unknown',
    });
    session.lastActivity = Date.now();
  }

  _makeCollectedDataPayload(session) {
    return JSON.stringify({
      message: session.collectedData.message || '',
      reason: session.collectedData.reason || '',
      urgency: session.collectedData.urgency || '',
      updates: session.collectedData.updates || '',
      personal: session.collectedData.personal || '',
      conversation_log: session.conversationLog.map(entry => ({
        time: entry.timestamp,
        who: entry.role,
        text: entry.text.slice(0, 240),
        state: entry.state,
      })),
      off_topic_count: session.offTopicCount,
    });
  }

  async _saveToSheets(session, senderId, phone) {
    // Best-effort save — don't throw
    try {
      const lastEntry = session.conversationLog[session.conversationLog.length - 1];
      if (!lastEntry) return;

      const sessionId = this._makeSessionId(senderId);
      const url = this.sheetsUrl;
      if (!url) return;

      const params = new URLSearchParams({
        action: 'log_away_conversation',
        session_id: sessionId,
        step: session.conversationLog.length,
        phone,
        incoming_message: lastEntry.role === 'sender' ? lastEntry.text : '',
        reply_message: lastEntry.role === 'charlie' ? lastEntry.text : '',
        state: lastEntry.state || session.state,
        _t: Date.now(),
      });
      await fetch(`${url}?${params.toString()}`);
    } catch (_) {
      // Silently fail — conversation continues regardless
    }
  }

  async _saveConversationToSheets(session, senderId, phone, status) {
    try {
      const url = this.sheetsUrl;
      if (!url) return;

      const sessionId = this._makeSessionId(senderId);
      const payload = this._makeCollectedDataPayload(session);

      const params = new URLSearchParams({
        action: 'save_away_conversation',
        session_id: sessionId,
        phone,
        chat_id: senderId,
        status: status || session.state,
        collected_data: payload,
        _t: Date.now(),
      });
      await fetch(`${url}?${params.toString()}`);
    } catch (_) {
      // Silently fail
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
const awayBrain = new AwayBrain();

export function processInput(incomingMessage, senderId, options = {}) {
  const result = awayBrain.processInput(incomingMessage, senderId, options);
  return result ? { text: result.reply } : null;
}

export function handleMediaInput(mediaType, caption, senderId, options = {}) {
  const result = awayBrain.handleMedia(mediaType, caption, senderId, options);
  return result ? { text: result.reply } : null;
}

export function checkTimeouts() {
  return awayBrain.checkTimeouts();
}

export function getDefaultMessage() {
  return 'Vivek is away at the moment, this is Charlie speaking. You can leave your message here, and Vivek will respond when he is back.';
}

export function setSheetsUrl(url) {
  awayBrain.setSheetsUrl(url);
}

export function getSession(senderId) {
  return awayBrain.getSession(senderId);
}

export function getAllConversations() {
  return awayBrain.getAllConversations();
}

export function getConversationCount() {
  return awayBrain.getConversationCount();
}

export function resetSession(senderId) {
  awayBrain.resetSession(senderId);
}

export default awayBrain;
