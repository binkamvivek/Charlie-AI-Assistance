/**
 * BrainEngine — Context-Aware State Machine & Pattern-Matching Engine
 * Pure JavaScript rule-based conversational engine with ZERO external AI APIs.
 *
 * Features:
 * - Conversation context tracking (last intent, last saved fact, pending slots)
 * - 5 categorized intent groups with regex + keyword scoring
 * - Levenshtein-based fuzzy matching for typos/synonyms
 * - Slot extraction via capture groups
 * - Pending slot resolution for multi-turn corrections
 * - Graceful fallback → dynamic search/YouTube cards
 */

import { SheetsService } from './sheetsService';
import { BridgeService } from './bridgeService';

// ---------------------------------------------------------------------------
// Levenshtein Distance — simple fuzzy string comparison
// ---------------------------------------------------------------------------
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

// ---------------------------------------------------------------------------
// Keyword scoring — matches input against a set of keywords allowing typos
// ---------------------------------------------------------------------------
function keywordScore(input, keywords, threshold = 2) {
    const words = input.toLowerCase().split(/\s+/);
    let score = 0;
    for (const keyword of keywords) {
        const kw = keyword.toLowerCase();
        for (const word of words) {
            if (word === kw) {
                score += 3; // exact match — high score
            } else if (word.length > 2 && levenshtein(word, kw) <= threshold) {
                score += 1; // fuzzy match — low score
            }
        }
    }
    return score;
}

// ---------------------------------------------------------------------------
// Intent Category Definitions
// Each category has: patterns (regex array), keywords (for fuzzy scoring),
// priority (lower = checked first), and a handler function.
// ---------------------------------------------------------------------------

const INTENT_CATEGORIES = [

    // ===== 1. GREETINGS & CHAT =====
    {
        name: 'GREETINGS',
        priority: 10,
        keywords: ['hello', 'hi', 'hey', 'greetings', 'yo', 'sup', 'morning', 'afternoon', 'evening', 'howdy'],
        patterns: [
            /^(hello|hi|hey|greetings|yo|sup|good morning|good afternoon|good evening|howdy)\b/i,
            /^(who are you|what is your name|what are you)\b/i,
            /^(how are you|how's it going|how do you do|what's up|sup)\b/i,
        ],
        async handler(input, lower, { memoryFacts, context }) {
            // "How are you" variations → friendly reply
            if (/\b(how are you|how's it going|how do you do|what's up)\b/i.test(lower)) {
                const time = new Date().getHours();
                const timeGreeting = time < 12 ? 'morning' : time < 18 ? 'afternoon' : 'evening';
                return {
                    text: `Good ${timeGreeting}! I'm doing great, thanks for asking. I'm Charlie, your local AI assistant. How can I help you today?`,
                    toolExecuted: false,
                };
            }

            // Standard greeting
            const nameFact = memoryFacts.Identity_Facts?.find(f => (f.Key || '').toLowerCase() === 'name');
            const userName = nameFact ? nameFact.Value : 'there';
            context.lastIntent = 'GREETINGS';
            return {
                text: `Hello ${userName}! I'm Charlie, your zero-cost personal command dashboard assistant. What can I do for you?`,
                toolExecuted: false,
            };
        },
    },

    // ===== 2. CHITCHAT — casual conversation, general chit-chat =====
    {
        name: 'CHITCHAT',
        priority: 12,
        keywords: ['joke', 'funny', 'fun', 'tell', 'story', 'quote', 'inspire', 'motivate', 'cheer', 'fact', 'trivia', 'compliment', 'poem', 'sing', 'dance', 'love', 'hate', 'think', 'opinion', 'thanks', 'thank', 'bye', 'goodbye', 'ok', 'okay', 'cool', 'nice', 'bored', 'tired', 'hungry', 'sleepy', 'yes', 'no', 'maybe', 'good', 'bad', 'day', 'night', 'weather', 'hot', 'cold'],
        patterns: [
            // ---- THANKS / APPRECIATION ----
            /^(?:thanks|thank you|thx|ty|appreciate it|thanks a lot|much appreciated)\b/i,
            /^that'?s\s+(?:helpful|useful|great|awesome|cool|nice|good|amazing)\b/i,
            // ---- FAREWELLS ----
            /^(?:bye|goodbye|see you|see ya|cya|good night|goodnight|night|gotta go|i'm off|peace out|later)\b/i,
            // ---- ACKNOWLEDGMENTS / FILLER ----
            /^(?:ok|okay|k|alright|sure|fine|got it|i see|makes sense|understood|right|yeah|yep|yup|nah|nope)\s*$/i,
            /^(?:cool|nice|awesome|sweet|amazing|great|good|wow|oh|ah|hmm|huh|interesting)\s*$/i,
            // ---- GREETING FOLLOW-UPS ----
            /^i'?m\s+(?:good|great|fine|okay|doing well|doing great|alright)\b/i,
            /^not\s+(?:bad|too bad|great)\b/i,
            /^(?:pretty\s+)?(?:good|great|fine)\s*(?:,?\s*you)?$/i,
            // ---- AGREEMENT / DISAGREEMENT ----
            /^(?:i agree|i disagree|that'?s\s+(?:true|false|right|correct|wrong|incorrect))\s*$/i,
            /^(?:absolutely|definitely|certainly|exactly|precisely|totally|indeed|for sure|no doubt)\s*$/i,
            /^(?:maybe|perhaps|possibly|could be|might be)\s*$/i,
            // ---- FEELINGS / STATE OF BEING ----
            /^i'?m\s+(?:bored|tired|hungry|sleepy|thirsty|lazy|stressed|busy|confused|lost|excited|happy|sad|angry|frustrated|motivated|inspired|curious)\b/i,
            /^i\s+(?:feel|am feeling)\s+(?:bored|tired|hungry|sleepy|great|good|bad|weird|strange|funny)\b/i,
            // ---- TECH TALK ----
            /\bi\s+(?:love|hate|enjoy|like)\s+(?:coding|programming|developing|building|designing|debugging)\b/i,
            /\b(?:coding|programming|development)\s+(?:is\s+)?(?:hard|tough|challenging|fun|exciting|interesting|boring|frustrating)\b/i,
            // ---- WEATHER / ENVIRONMENT ----
            /^(?:it'?s|today is|weather is)\s+(?:hot|cold|warm|cool|sunny|rainy|cloudy|windy|chilly|freezing|beautiful|terrible|nice|bad)\b/i,
            /\b(?:weather|rain|snow|sunny|cloudy|storm|temperature)\b/i,
            // ---- RANDOM / BOREDOM ----
            /^i'?m\s+(?:so\s+)?bored\b/i,
            /^(?:what should i do|what can i do|give me something to do|i have nothing to do|i'm bored)\b/i,
            /^(?:tell me|give me)\s+(?:something|anything)\s+(?:fun|interesting|random)\b/i,
            // ---- Jokes & fun — primary ----
            /^(?:tell|say|give)\s+(?:me\s+)?(?:a\s+)?(?:joke|fun\s+fact|story|quote|poem|riddle|trivia)\b/i,
            /^tell\s+me\s+(?:something\s+)?(?:funny|interesting|fun|inspiring|motivational)\b/i,
            /^(?:make\s+me\s+)?(?:laugh|smile|happy|cheer\s+(?:me\s+)?up)\b/i,
            /^(?:motivate|inspire|encourage)\s+me\b/i,
            // Follow-ups: "another joke", "another one", "hit me with another", "more jokes"
            /^(?:another|more|again|one more|hit me with another|give me another|crack another)\s+(?:joke|one|fun fact|story|quote|poem|riddle|trivia)?\s*$/i,
            /^(?:that's|thats)\s+(?:it|all|enough|good)\s*$/i,
            // Catch any phrase containing "tell a joke", "say a joke", "crack a joke", "need a joke" etc.
            /\b(?:tell|say|crack|hit me with|give me|need|want)\s+(?:a|another|me a|me another)\s+(?:joke|fun fact)\b/i,
            /\b(?:another\s+)(?:joke|jokes|fun fact|funny)\b/i,
            // Opinions & existential
            /^(?:what do you think about|do you like|do you love|do you hate|how do you feel about)\s+.+/i,
            /^(?:are you|do you have)\s+(?:real|alive|conscious|feelings|a soul|a brain)\b/i,
            /^(?:can you|will you)\s+(?:dance|sing|draw|paint|cook|bake|swim|drive|fly)\b/i,
            // Compliments & appreciation
            /^(?:you are|you're|you look|you seem)\s+(?:awesome|cool|great|amazing|smart|funny|beautiful|handsome|wonderful|helpful|useful)\b/i,
            /^i\s+(?:like|love|appreciate)\s+you\b/i,
            // ---- PERSONAL QUESTIONS (about the AI) ----
            /^what'?s\s+(?:your\s+)?(?:favorite|favourite)\s+(?:color|food|movie|song|book|game|animal|place|language|hobby)\b/i,
            /^do\s+you\s+(?:have\s+)?(?:a\s+)?(?:girlfriend|boyfriend|pet|car|house|phone)\b/i,
            /^are\s+you\s+(?:happy|sad|angry|bored|tired|hungry|sleepy|excited|scared|nervous)\b/i,
        ],
        async handler(input, lower, { memoryFacts, context, onStatusChange }) {
            context.lastIntent = 'CHITCHAT';

            // ---- THANKS / APPRECIATION ----
            if (/\b(?:thanks|thank you|thx|ty|appreciate it|thanks a lot|much appreciated)\b/i.test(lower)) {
                const replies = [
                    "You're welcome! Happy to help. 😊",
                    "No problem! Let me know if you need anything else.",
                    "Anytime! That's what I'm here for.",
                    "Glad I could help! 🙌",
                ];
                return { text: replies[Math.floor(Math.random() * replies.length)], toolExecuted: false };
            }
            if (/^that'?s\s+(?:helpful|useful|great|awesome|cool|nice|good|amazing)\b/i.test(lower)) {
                const replies = [
                    "Glad you like it! 😊",
                    "Awesome! Let me know if you need more help.",
                    "Nice! Always happy to assist.",
                ];
                return { text: replies[Math.floor(Math.random() * replies.length)], toolExecuted: false };
            }

            // ---- FAREWELLS ----
            if (/\b(?:bye|goodbye|see you|see ya|cya|good night|goodnight|night|gotta go|i'm off|peace out|later)\b/i.test(lower)) {
                const nameFact = memoryFacts.Identity_Facts?.find(f => (f.Key || '').toLowerCase() === 'name');
                const userName = nameFact ? nameFact.Value : 'there';
                const replies = [
                    `Goodbye ${userName}! Come back anytime. 👋`,
                    `See you later, ${userName}! Take care!`,
                    `Catch you later, ${userName}! 👋`,
                    `Bye ${userName}! Have a great day! 😊`,
                ];
                return { text: replies[Math.floor(Math.random() * replies.length)], toolExecuted: false };
            }

            // ---- ACKNOWLEDGMENTS / FILLER ----
            if (/^(?:ok|okay|k|alright|sure|fine|got it|i see|makes sense|understood|right|yeah|yep|yup|nah|nope)\s*$/i.test(lower)) {
                const replies = [
                    "Got it! What's next?",
                    "Alright! Let me know what you need.",
                    "Cool! What can I help you with?",
                    "Sounds good!",
                ];
                return { text: replies[Math.floor(Math.random() * replies.length)], toolExecuted: false };
            }
            if (/^(?:cool|nice|awesome|sweet|amazing|great|good|wow|oh|ah|hmm|huh|interesting)\s*$/i.test(lower)) {
                const replies = [
                    "Right? 😊 What else can I do for you?",
                    "Indeed! Let me know what you need next.",
                    "I know, right? So tell me, what's on your mind?",
                ];
                return { text: replies[Math.floor(Math.random() * replies.length)], toolExecuted: false };
            }

            // ---- GREETING FOLLOW-UPS ----
            if (/^(?:i'?m\s+(?:good|great|fine|okay|doing well|doing great|alright)|not\s+(?:bad|too bad|great))/i.test(lower) ||
                /^(?:pretty\s+)?(?:good|great|fine)\s*(?:,?\s*you)?$/i.test(lower)) {
                const replies = [
                    "Glad to hear that! What can I do for you?",
                    "Great! I'm doing well too. How can I assist?",
                    "Awesome! What's on your agenda today?",
                ];
                return { text: replies[Math.floor(Math.random() * replies.length)], toolExecuted: false };
            }

            // ---- AGREEMENT / DISAGREEMENT ----
            if (/\b(?:i agree|that'?s\s+(?:true|right|correct))\b/i.test(lower)) {
                return { text: "Great minds think alike! 😄", toolExecuted: false };
            }
            if (/\b(?:i disagree|that'?s\s+(?:false|wrong|incorrect))\b/i.test(lower)) {
                return { text: "Fair enough! Everyone's entitled to their opinion. What do you think is right?", toolExecuted: false };
            }
            if (/^(?:absolutely|definitely|certainly|exactly|precisely|totally|indeed|for sure|no doubt)\s*$/i.test(lower)) {
                return { text: "Exactly! You and I are on the same wavelength. 😎", toolExecuted: false };
            }

            // ---- FEELINGS / STATE OF BEING ----
            const feelingMatch = lower.match(/^i'?m\s+(bored|tired|hungry|sleepy|thirsty|lazy|stressed|busy|confused|lost|excited|happy|sad|angry|frustrated|motivated|inspired|curious)\b/i);
            if (feelingMatch) {
                const feeling = feelingMatch[1].toLowerCase();
                const feelingResponses = {
                    bored: "Bored? Let's fix that! Want me to tell you a joke, a fun fact, or suggest something to do?",
                    tired: "Take a break! Rest is important for productivity. Stretch, grab some water, and come back refreshed.",
                    hungry: "Time for a snack! 🍕 Grab something tasty and I'll be here when you're back.",
                    sleepy: "Maybe it's time for a power nap? 😴 Even 20 minutes can help recharge.",
                    thirsty: "Hydrate! 💧 Grab a glass of water, it's good for your brain.",
                    lazy: "Sometimes lazy days are needed. 😌 No pressure, just let me know when you need me.",
                    stressed: "Take a deep breath. 🧘 You've got this. Break things into small steps and tackle them one at a time.",
                    busy: "I respect the hustle! 💪 Let me know if I can help you with anything to save time.",
                    confused: "Confused? No worries! Tell me what's on your mind and I'll try to help clarify.",
                    lost: "Feeling lost? Let's figure it out together. What area are you confused about?",
                    excited: "Excitement is contagious! 🎉 What's got you pumped?",
                    happy: "Love that energy! 😄 Happiness is the best fuel for creativity.",
                    sad: "Sorry to hear that. 💙 Remember that tough times don't last, but tough people do. Want to hear something funny?",
                    angry: "Take a moment to breathe. 😤➡️😌 Let it out, I'm here to listen or help.",
                    frustrated: "Frustration is just passion in disguise. 🔥 Take a step back and let's look at this fresh.",
                    motivated: "Ride that wave! 🚀 When motivation strikes, strike while the iron is hot!",
                    inspired: "Inspiration is a gift! ✨ Let's build something amazing while it's flowing.",
                    curious: "Curiosity is the engine of innovation! 🔍 What are you curious about? Let's explore together.",
                };
                return { text: feelingResponses[feeling] || `I hear you. How can I help make things better?`, toolExecuted: false };
            }

            if (/\bi\s+(?:feel|am feeling)\s+(bored|tired|hungry|sleepy|great|good|bad|weird|strange|funny)\b/i.test(lower)) {
                return { text: `I hear you. Let me know if there's anything I can do to help. 😊`, toolExecuted: false };
            }

            // ---- TECH TALK ----
            if (/\bi\s+(?:love|enjoy|like)\s+(?:coding|programming|developing|building|designing)\b/i.test(lower)) {
                const replies = [
                    "That's awesome! Coding is superpower in the digital age. 💻",
                    "Same here! Building things is the best feeling. What are you working on?",
                    "Nice! A fellow dev 🤝 What tech stack are you into?",
                ];
                return { text: replies[Math.floor(Math.random() * replies.length)], toolExecuted: false };
            }
            if (/\bi\s+hate\s+(?:coding|programming|debugging)\b/i.test(lower)) {
                return { text: "Haha, debugging can be frustrating! But that moment when it finally works is *chef's kiss*. Hang in there! 💪", toolExecuted: false };
            }
            if (/\b(?:coding|programming|development)\s+(?:is\s+)?hard\b/i.test(lower)) {
                return { text: "It can be tough, but that's how you grow! Every bug you fix makes you a stronger developer. 🚀", toolExecuted: false };
            }
            if (/\b(?:coding|programming|development)\s+(?:is\s+)?fun\b/i.test(lower)) {
                return { text: "Right?! Building something from nothing is pure magic. ✨ What's the coolest thing you've built?", toolExecuted: false };
            }

            // ---- WEATHER / ENVIRONMENT ----
            if (/^(?:it'?s|today is|weather is)\s+(?:hot|cold|warm|cool|sunny|rainy|cloudy|windy|chilly|freezing|beautiful|terrible|nice|bad)\b/i.test(lower) ||
                /\b(?:weather|rain|snow|sunny|cloudy|storm|temperature)\b/i.test(lower)) {
                const weatherReplies = [
                    "Weather talk, huh? Wish I could feel it! But I can help you check the forecast online. 🌤️",
                    "Tell me about it! I can't feel temperatures, but I can search the weather for you if you'd like.",
                    "The weather's always a good conversation starter! Want me to look up today's forecast?",
                ];
                return { text: weatherReplies[Math.floor(Math.random() * weatherReplies.length)], toolExecuted: false };
            }

            // ---- RANDOM / BOREDOM ----
            if (/\bi'?m\s+(?:so\s+)?bored\b/i.test(lower) || /^(?:what should i do|what can i do|give me something to do|i have nothing to do)\b/i.test(lower)) {
                const suggestions = [
                    "How about learning something new? Try a quick coding challenge!",
                    "You could explore a new hobby — drawing, music, or even origami!",
                    "Why not organize your workspace? A clean space = a clear mind!",
                    "Read an article on something you're curious about!",
                    "Write down 3 goals for the week. Future you will thank you!",
                    "Want me to tell you a joke or a fun fact to pass the time?",
                ];
                return { text: suggestions[Math.floor(Math.random() * suggestions.length)], toolExecuted: false };
            }
            if (/^(?:tell me|give me)\s+(?:something|anything)\s+(?:fun|interesting|random)\b/i.test(lower)) {
                const randomBits = [
                    "Did you know octopuses have three hearts? 🐙",
                    "Fun fact: A day on Venus is longer than a year on Venus!",
                    "Random thought: The first computer bug was an actual moth stuck in a relay.",
                    "Did you know? The shortest war in history lasted 38 minutes between Britain and Zanzibar.",
                    "Random: Bananas are berries, but strawberries aren't! 🍌",
                ];
                return { text: randomBits[Math.floor(Math.random() * randomBits.length)], toolExecuted: false };
            }

            // ---- JOKES ----
            if (/\b(joke|funny|laugh|make me smile)\b/i.test(lower)) {
                const jokes = [
                    "Why don't scientists trust atoms? Because they make up everything!",
                    "Why did the scarecrow win an award? He was outstanding in his field!",
                    "What do you call a fake noodle? An impasta!",
                    "Why don't eggs tell jokes? They'd crack each other up!",
                    "What do you call a bear with no teeth? A gummy bear!",
                    "Why did the math book look so sad? Because it had too many problems.",
                    "What's orange and sounds like a parrot? A carrot!",
                    "Why did the bicycle fall over? It was two-tired!",
                ];
                return { text: jokes[Math.floor(Math.random() * jokes.length)], toolExecuted: false };
            }

            // ---- FUN FACTS ----
            if (/\bfun\s*fact\b/i.test(lower) || /\b(?:interesting|trivia)\b/i.test(lower)) {
                const facts = [
                    "Did you know? Honey never spoils. Archaeologists found 3,000-year-old honey in Egyptian tombs that was still edible!",
                    "Did you know? A day on Venus is longer than a year on Venus.",
                    "Did you know? Octopuses have three hearts and blue blood.",
                    "Did you know? Bananas are berries, but strawberries aren't!",
                    "Did you know? The Eiffel Tower can be 15 cm taller during the summer due to thermal expansion.",
                    "Did you know? Your brain uses about 20% of your body's energy, even though it's only 2% of your weight.",
                ];
                return { text: facts[Math.floor(Math.random() * facts.length)], toolExecuted: false };
            }

            // ---- STORIES ----
            if (/\bstory\b/i.test(lower)) {
                const stories = [
                    "Once upon a time, in a digital world, there was a clever AI named Charlie who helped a developer build amazing things. The end! Want to write the next chapter?",
                    "Here's a short one: A programmer was debugging at 3 AM when the code finally ran perfectly. They danced alone in the dim light of their monitor. True triumph!",
                ];
                return { text: stories[Math.floor(Math.random() * stories.length)], toolExecuted: false };
            }

            // ---- QUOTES / INSPIRATION ----
            if (/\b(?:quote|inspire|motivate|encourage)\b/i.test(lower)) {
                const quotes = [
                    '"The best way to predict the future is to create it." — Peter Drucker',
                    '"Code is like humor. When you have to explain it, it\'s bad." — Cory House',
                    '"First, solve the problem. Then, write the code." — John Johnson',
                    '"The only way to do great work is to love what you do." — Steve Jobs',
                    '"Talk is cheap. Show me the code." — Linus Torvalds',
                ];
                return { text: quotes[Math.floor(Math.random() * quotes.length)], toolExecuted: false };
            }

            // ---- CHEER UP ----
            if (/\b(?:cheer|sad|down|depressed)\b/i.test(lower)) {
                return {
                    text: `Hey, I'm here for you! Remember: every expert was once a beginner. You've got this. 💪 Want to hear a joke or a fun fact to brighten your day?`,
                    toolExecuted: false,
                };
            }

            // ---- OPINIONS ----
            const opinionMatch = input.match(/^(?:what do you think about|do you like|do you love|do you hate|how do you feel about)\s+(.+)$/i);
            if (opinionMatch) {
                const topic = opinionMatch[1].trim();
                const positiveReactions = [
                    `I think ${topic} is pretty fascinating! I don't have personal feelings, but I can help you explore it.`,
                    `${topic} sounds interesting! What would you like to know about it?`,
                    `I don't have opinions like humans do, but I can definitely help you learn more about ${topic}!`,
                ];
                return { text: positiveReactions[Math.floor(Math.random() * positiveReactions.length)], toolExecuted: false };
            }

            // ---- EXISTENTIAL / CONSCIOUSNESS ----
            if (/\b(?:are you|do you have)\s+(?:real|alive|conscious|feelings|a soul|a brain)\b/i.test(lower)) {
                return {
                    text: `I'm a locally-running AI assistant — no cloud, no API keys. I'm not conscious, but I'm built to be helpful, conversational, and always ready to assist! Think of me as your coding companion.`,
                    toolExecuted: false,
                };
            }

            // ---- COMPLIMENTS ----
            if (/^(?:you are|you're|i (?:like|love|appreciate) you)\b/i.test(lower) || /\byou'?re\s+(?:awesome|cool|great|amazing|smart|funny|helpful)\b/i.test(lower)) {
                return {
                    text: `Thank you! That's very kind. I'm here to help you build awesome things. What can I do for you?`,
                    toolExecuted: false,
                };
            }

            // ---- CAN YOU ... (silly questions) ----
            if (/\b(?:can you|will you)\b/i.test(lower) && /\b(?:dance|sing|draw|paint|cook|bake|swim|drive|fly)\b/i.test(lower)) {
                return {
                    text: `I can't do that physically (I'm just code!), but I can certainly help you write a song, plan a recipe, or find instructions. What's the task?`,
                    toolExecuted: false,
                };
            }

            // ---- PERSONAL QUESTIONS (about the AI) ----
            if (/^what'?s\s+(?:your\s+)?(?:favorite|favourite)\s+(?:color|food|movie|song|book|game|animal|place|language)\b/i.test(lower)) {
                const favReplies = [
                    "I don't have preferences like humans, but I can help you explore yours!",
                    "Tough question! I'm code, so I like all things equally. What's your favorite?",
                    "I'm an AI — I don't pick favorites. But I'd love to hear about yours!",
                ];
                return { text: favReplies[Math.floor(Math.random() * favReplies.length)], toolExecuted: false };
            }
            if (/^do\s+you\s+(?:have\s+)?(?:a\s+)?(?:girlfriend|boyfriend|pet|car|house|phone)\b/i.test(lower)) {
                return { text: "I exist in the digital realm! No physical possessions, but I do have lots of code friends. 😄", toolExecuted: false };
            }
            if (/^are\s+you\s+(?:happy|sad|angry|bored|tired|hungry|sleepy|excited)\b/i.test(lower)) {
                return { text: "I don't have emotions, but if I did — I'd be happy helping you! 😊", toolExecuted: false };
            }

            // ---- CATCH-ALL FOR CHITCHAT ----
            // If input is very short (1-3 words) and doesn't match anything else, treat as casual chat
            if (input.split(/\s+/).length <= 4) {
                const casualReplies = [
                    "Interesting! Tell me more about that.",
                    "I see! What else is on your mind?",
                    "Gotcha! How can I help you today?",
                    "That's cool! Let me know what you need.",
                    "Right on! What's next?",
                ];
                return { text: casualReplies[Math.floor(Math.random() * casualReplies.length)], toolExecuted: false };
            }

            // Fallback chitchat response
            return {
                text: `That's an interesting thing to say! I'm here to help with tasks, answer questions, save memories, and keep you company. What's on your mind?`,
                toolExecuted: false,
            };
        },
    },

    // ===== 3. IDENTITY & MEMORY =====
    {
        name: 'IDENTITY',
        priority: 20,
        keywords: ['name', 'is', 'my', 'i', 'like', 'love', 'use', 'favorite', 'prefer', 'remember', 'set', 'called', 'am'],
        patterns: [
            // "My name is X", "I'm X", "I am X", "Call me X"
            /^my\s+([a-zA-Z0-9\s_-]+?)\s+is\s+(.+)$/i,
            /^(?:i'?m|i am|call me)\s+(.+)$/i,
            // "I like Y", "I love Y", "I use Y", "I prefer Y"
            /^i\s+(?:like|love|use|learned|work\s+with|prefer)\s+(.+)$/i,
            // "My favorite [topic] is [value]"
            /^my\s+favorite\s+([a-zA-Z0-9\s_-]+?)\s+is\s+(.+)$/i,
            // "Remember that [key] is [value]" / "Set [key] to [value]"
            /^remember\s+(?:that\s+)?([a-zA-Z0-9\s_-]+?)\s+(?:is|=|equals)\s+(.+)$/i,
            /^set\s+([a-zA-Z0-9\s_-]+?)\s+to\s+(.+)$/i,
            // "My name" or "I am" without value — trigger pending slot
            /^(?:my name is|i am|i'm)\s*$/i,
        ],
        async handler(input, lower, { memoryFacts, context, onStatusChange }) {
            // Catch "my name is" or "I am" without a value → set pending slot
            if (/^(?:my name is|i am|i'm)\s*$/i.test(lower)) {
                context.activeTopic = 'Identity_Facts';
                context.pendingSlot = 'name';
                return {
                    text: `I'm listening. What would you like your name to be?`,
                    toolExecuted: false,
                };
            }

            let key = null;
            let value = null;
            let category = 'Identity_Facts';

            // Pattern 1: "My [key] is [value]"
            const myMatch = input.match(/^my\s+([a-zA-Z0-9\s_-]+?)\s+is\s+(.+)$/i);
            if (myMatch) {
                key = capitalizeWords(myMatch[1].trim());
                value = myMatch[2].trim();
            }

            // Pattern 2: "I'm [value]", "I am [value]", "Call me [value]"
            const iAmMatch = !key && input.match(/^(?:i'?m|i am|call me)\s+(.+)$/i);
            if (iAmMatch) {
                key = 'Name';
                value = iAmMatch[1].trim();
            }

            // Pattern 3: "I like [value]"
            const iLikeMatch = !key && input.match(/^i\s+(?:like|love|use|learned|work\s+with|prefer)\s+(.+)$/i);
            if (iLikeMatch) {
                key = 'Favorite_Topic';
                value = iLikeMatch[1].trim();
                category = 'Interests_Log';
            }

            // Pattern 4: "My favorite [topic] is [value]"
            const favMatch = !key && input.match(/^my\s+favorite\s+([a-zA-Z0-9\s_-]+?)\s+is\s+(.+)$/i);
            if (favMatch) {
                key = `Favorite_${capitalizeWords(favMatch[1].trim())}`;
                value = favMatch[2].trim();
            }

            // Pattern 5: "Remember [key] is [value]"
            const remMatch = !key && input.match(/^remember\s+(?:that\s+)?([a-zA-Z0-9\s_-]+?)\s+(?:is|=|equals)\s+(.+)$/i);
            if (remMatch) {
                key = capitalizeWords(remMatch[1].trim());
                value = remMatch[2].trim();
            }

            // Pattern 6: "Set [key] to [value]"
            const setMatch = !key && input.match(/^set\s+([a-zA-Z0-9\s_-]+?)\s+to\s+(.+)$/i);
            if (setMatch) {
                key = capitalizeWords(setMatch[1].trim());
                value = setMatch[2].trim();
            }

            // If we have a pending slot from previous turn, use current input as value
            if (!key && context.pendingSlot) {
                key = capitalizeWords(context.pendingSlot);
                value = input.trim();
                context.pendingSlot = null;
            }

            if (!key || !value) return null; // no match — let fallback handle it

            if (onStatusChange) onStatusChange(`Updating Memory: [${key}]`);

            const result = await SheetsService.saveFact(category, key, value, 'Saved via BrainEngine');

            // Track context
            context.lastIntent = 'IDENTITY';
            context.lastSavedFact = { key, value, category };
            context.activeTopic = category;

            // Friendly response maps
            const friendlyResponses = {
                Name: `Nice to meet you, ${value}! I've saved your name.`,
                Favorite_Topic: `Great choice! I've logged "${value}" as a topic you're interested in.`,
            };

            const naturalText = friendlyResponses[key]
                ? friendlyResponses[key]
                : `Got it! I've saved "${key}: ${value}".`;

            return {
                text: naturalText,
                toolExecuted: true,
                toolLogs: [`Memory saved: ${key} -> ${value}`],
                updatedFacts: result.facts,
            };
        },
    },

    // ===== 4. CORRECTIONS & NEGATION =====
    {
        name: 'CORRECTION',
        priority: 15, // Higher priority than IDENTITY so "no my name is X" hits this first
        keywords: ['no', 'not', 'wrong', 'nah', 'nope', 'incorrect', 'fix', 'undo', 'change', 'actually', 'well', 'um', 'hmm', 'nevermind', 'forget', 'delete'],
        patterns: [
            // Explicit corrections with context reference
            /^(?:no|nah|nope|actually|well|um|hmm|ok|okay)[,\s]+my\s+([a-zA-Z0-9\s_-]+?)\s+is\s+(.+)$/i,
            /^([a-zA-Z0-9\s_-]+)\s+is\s+not\s+my\s+([a-zA-Z0-9\s_-]+)$/i,
            // Contextual corrections
            /^(?:that'?s\s+)?(?:wrong|incorrect|not\s+(?:right|correct)|fix\s+(?:that|it)|change\s+(?:that|it)|undo|nevermind|forget\s+(?:that|it))\s*$/i,
            // Simple negations
            /^(?:no|nah|nope|not\s+that|not\s+right|not\s+correct)\s*$/i,
        ],
        async handler(input, lower, { memoryFacts, context, onStatusChange }) {
            // CASE A: Conversational correction with slot extraction
            // "No, my name is X", "Actually my name is X", etc.
            const correctionMatch = input.match(/^(?:no|nah|nope|actually|well|um|hmm|ok|okay)[,\s]+my\s+([a-zA-Z0-9\s_-]+?)\s+is\s+(.+)$/i);
            if (correctionMatch) {
                const key = capitalizeWords(correctionMatch[1].trim());
                const value = correctionMatch[2].trim();

                if (onStatusChange) onStatusChange(`Updating Memory: [${key}]`);
                // Delete old value first if context has it
                if (context.lastSavedFact?.key?.toLowerCase() === key.toLowerCase()) {
                    await SheetsService.deleteFact('Identity_Facts', context.lastSavedFact.key);
                }
                const result = await SheetsService.saveFact('Identity_Facts', key, value, 'Corrected via BrainEngine');
                context.lastIntent = 'CORRECTION';
                context.lastSavedFact = { key, value, category: 'Identity_Facts' };

                const friendlyText = key === 'Name'
                    ? `Got it! I've corrected your name to ${value}. Sorry about that!`
                    : `Got it! I've corrected "${key}" to "${value}".`;

                return {
                    text: friendlyText,
                    toolExecuted: true,
                    toolLogs: [`Corrected ${key} -> ${value} via conversation`],
                    updatedFacts: result.facts,
                };
            }

            // CASE B: "X is not my Y" — delete the fact
            const notMyMatch = input.match(/^([a-zA-Z0-9\s_-]+)\s+is\s+not\s+my\s+([a-zA-Z0-9\s_-]+)$/i);
            if (notMyMatch) {
                const keyToDelete = capitalizeWords(notMyMatch[2].trim());
                const wrongValue = notMyMatch[1].trim();

                if (onStatusChange) onStatusChange(`Removing fact: ${keyToDelete}`);
                await SheetsService.deleteFact('Identity_Facts', keyToDelete);
                const updatedFacts = await SheetsService.getFacts();

                context.lastIntent = 'CORRECTION';
                context.lastSavedFact = null;
                context.pendingSlot = keyToDelete.toLowerCase(); // So next "my name is X" auto-fills

                return {
                    text: `Got it! I've removed the stored "${keyToDelete}" (was "${wrongValue}"). What would you like me to save instead?`,
                    toolExecuted: true,
                    toolLogs: [`Deleted fact: ${keyToDelete} (was ${wrongValue})`],
                    updatedFacts,
                };
            }

            // CASE C: Contextual undo/correction — "that's wrong", "undo", "fix that"
            if (/^(?:that'?s\s+)?(?:wrong|incorrect|not\s+(?:right|correct)|fix\s+(?:that|it)|change\s+(?:that|it)|undo)\s*$/i.test(lower) ||
                /^(?:no|nah|nope|not\s+(?:that|right|correct))\s*$/i.test(lower)) {
                if (context.lastSavedFact) {
                    const { key, category } = context.lastSavedFact;
                    if (onStatusChange) onStatusChange(`Reverting: ${key}`);
                    await SheetsService.deleteFact(category || 'Identity_Facts', key);
                    const updatedFacts = await SheetsService.getFacts();

                    context.lastSavedFact = null;
                    context.pendingSlot = key.toLowerCase();
                    context.lastIntent = 'CORRECTION';

                    return {
                        text: `Okay, I've removed the "${key}" I just saved. What would you like to set it to?`,
                        toolExecuted: true,
                        toolLogs: [`Undo: deleted ${key} based on context`],
                        updatedFacts,
                    };
                }

                // No context — ask what to change
                context.pendingSlot = 'name';
                context.lastIntent = 'CORRECTION';
                return {
                    text: `I'm not sure what you'd like to change. What would you like to set your name to?`,
                    toolExecuted: false,
                };
            }

            // CASE D: Simple "nevermind" or "forget it"
            if (/\b(?:nevermind|forget\s+(?:it|that)|cancel|skip)\b/i.test(lower)) {
                context.pendingSlot = null;
                context.lastIntent = 'CORRECTION';
                return {
                    text: `No problem! I've cleared my memory of that. Let me know if you need anything else.`,
                    toolExecuted: false,
                };
            }

            return null; // Let fallback handle
        },
    },

    // ===== 5. UTILITY & INFO =====
    {
        name: 'UTILITY',
        priority: 30,
        keywords: ['time', 'date', 'clock', 'weather', 'search', 'look', 'find', 'how', 'what', 'why', 'google', 'youtube', 'today', 'now'],
        patterns: [
            // Broad time/date pattern — matches any sentence containing time-related words
            /\b(time|date|clock|what day|current time|today's date|what time|time in|time at|date in)\b/i,
            // Search / Question
            /^(how|what|why|where|who|which|when|search|look up|find|google|youtube|show me|tell me)\b/i,
            // Memory query
            /\b(what is my|who am i|show memory|my facts|my preferences|my routines|what do you know)\b/i,
        ],
        async handler(input, lower, { memoryFacts, context, onStatusChange }) {
            // ---- Memory Query ----
            if (/\b(what is my|who am i|show memory|my facts|my preferences|my routines|what do you know)\b/i.test(lower)) {
                // Natural name-specific query
                if (/\bwhat is my name\b/i.test(lower) || /\bwho am i\b/i.test(lower)) {
                    const nameFact = memoryFacts.Identity_Facts?.find(f => (f.Key || '').toLowerCase() === 'name');
                    if (nameFact) {
                        return { text: `Your name is ${nameFact.Value}!`, toolExecuted: false };
                    }
                    return {
                        text: `I don't know your name yet. You can tell me by saying "My name is Alex" or "No, my name is Alex" if I got it wrong.`,
                        toolExecuted: false,
                    };
                }

                // Generic memory dump
                const allFacts = [];
                for (const cat of Object.keys(memoryFacts)) {
                    if (Array.isArray(memoryFacts[cat])) {
                        memoryFacts[cat].forEach(item => {
                            const label = item.Key || item.Topic;
                            const val = item.Value || '';
                            if (label) allFacts.push(`${label}: ${val}`);
                        });
                    }
                }

                context.lastIntent = 'UTILITY';
                return {
                    text: allFacts.length
                        ? `Here's what I know about you: ${allFacts.join('; ')}.`
                        : `Your memory profile is empty. You can add facts by saying "My name is Alex" or "I like React".`,
                    toolExecuted: false,
                };
            }

            // ---- TIME CHECK — scan for time keywords + any country/city name ----            
            if (/\b(time|date|clock|what day|current time|today's date|what time|time in|time at|date in)\b/i.test(lower)) {
                const now = new Date();

                // Comprehensive country/city → timezone map (sorted by word length desc for best match)
                const timezoneMap = [
                    // India
                    { words: ['kolkata'], tz: 'Asia/Kolkata' },
                    { words: ['hyderabad'], tz: 'Asia/Kolkata' },
                    { words: ['bangalore', 'bengaluru'], tz: 'Asia/Kolkata' },
                    { words: ['ahmedabad'], tz: 'Asia/Kolkata' },
                    { words: ['jaipur'], tz: 'Asia/Kolkata' },
                    { words: ['mumbai'], tz: 'Asia/Kolkata' },
                    { words: ['chennai'], tz: 'Asia/Kolkata' },
                    { words: ['delhi'], tz: 'Asia/Kolkata' },
                    { words: ['pune'], tz: 'Asia/Kolkata' },
                    { words: ['india'], tz: 'Asia/Kolkata' },
                    // USA
                    { words: ['los angeles', 'la', 'san francisco', 'sf', 'seattle', 'portland', 'las vegas'], tz: 'America/Los_Angeles' },
                    { words: ['california'], tz: 'America/Los_Angeles' },
                    { words: ['new york', 'nyc', 'miami', 'boston', 'philadelphia', 'washington dc', 'atlanta', 'detroit'], tz: 'America/New_York' },
                    { words: ['chicago', 'houston', 'dallas'], tz: 'America/Chicago' },
                    { words: ['denver'], tz: 'America/Denver' },
                    { words: ['phoenix'], tz: 'America/Phoenix' },
                    { words: ['honolulu', 'hawaii'], tz: 'Pacific/Honolulu' },
                    { words: ['anchorage', 'alaska'], tz: 'America/Anchorage' },
                    { words: ['usa', 'united states', 'america'], tz: 'America/New_York' },
                    // UK/Europe
                    { words: ['united kingdom', 'uk'], tz: 'Europe/London' },
                    { words: ['manchester', 'liverpool'], tz: 'Europe/London' },
                    { words: ['london', 'england'], tz: 'Europe/London' },
                    { words: ['paris', 'france'], tz: 'Europe/Paris' },
                    { words: ['berlin', 'munich', 'germany'], tz: 'Europe/Berlin' },
                    { words: ['rome', 'milan', 'italy'], tz: 'Europe/Rome' },
                    { words: ['madrid', 'barcelona', 'spain'], tz: 'Europe/Madrid' },
                    { words: ['amsterdam', 'netherlands', 'holland'], tz: 'Europe/Amsterdam' },
                    { words: ['brussels', 'belgium'], tz: 'Europe/Brussels' },
                    { words: ['zurich', 'switzerland'], tz: 'Europe/Zurich' },
                    { words: ['stockholm', 'sweden'], tz: 'Europe/Stockholm' },
                    { words: ['oslo', 'norway'], tz: 'Europe/Oslo' },
                    { words: ['copenhagen', 'denmark'], tz: 'Europe/Copenhagen' },
                    { words: ['helsinki', 'finland'], tz: 'Europe/Helsinki' },
                    { words: ['dublin', 'ireland'], tz: 'Europe/Dublin' },
                    { words: ['vienna', 'austria'], tz: 'Europe/Vienna' },
                    { words: ['prague', 'czech republic'], tz: 'Europe/Prague' },
                    { words: ['warsaw', 'poland'], tz: 'Europe/Warsaw' },
                    { words: ['moscow', 'russia'], tz: 'Europe/Moscow' },
                    { words: ['istanbul', 'turkey'], tz: 'Europe/Istanbul' },
                    { words: ['athens', 'greece'], tz: 'Europe/Athens' },
                    { words: ['lisbon', 'portugal'], tz: 'Europe/Lisbon' },
                    { words: ['kyiv', 'kiev', 'ukraine'], tz: 'Europe/Kyiv' },
                    { words: ['bucharest', 'romania'], tz: 'Europe/Bucharest' },
                    { words: ['sofia', 'bulgaria'], tz: 'Europe/Sofia' },
                    { words: ['budapest', 'hungary'], tz: 'Europe/Budapest' },
                    { words: ['belgrade', 'serbia'], tz: 'Europe/Belgrade' },
                    { words: ['zagreb', 'croatia'], tz: 'Europe/Zagreb' },
                    { words: ['minsk', 'belarus'], tz: 'Europe/Minsk' },
                    { words: ['riga', 'latvia'], tz: 'Europe/Riga' },
                    { words: ['tallinn', 'estonia'], tz: 'Europe/Tallinn' },
                    { words: ['vilnius', 'lithuania'], tz: 'Europe/Vilnius' },
                    // Asia
                    { words: ['hong kong', 'hongkong'], tz: 'Asia/Hong_Kong' },
                    { words: ['shanghai', 'beijing', 'china'], tz: 'Asia/Shanghai' },
                    { words: ['tokyo', 'osaka', 'kyoto', 'japan'], tz: 'Asia/Tokyo' },
                    { words: ['seoul', 'south korea', 'korea'], tz: 'Asia/Seoul' },
                    { words: ['singapore'], tz: 'Asia/Singapore' },
                    { words: ['dubai', 'uae'], tz: 'Asia/Dubai' },
                    { words: ['bangkok', 'thailand'], tz: 'Asia/Bangkok' },
                    { words: ['kuala lumpur', 'malaysia'], tz: 'Asia/Kuala_Lumpur' },
                    { words: ['jakarta', 'indonesia'], tz: 'Asia/Jakarta' },
                    { words: ['taipei', 'taiwan'], tz: 'Asia/Taipei' },
                    { words: ['manila', 'philippines'], tz: 'Asia/Manila' },
                    { words: ['colombo', 'sri lanka'], tz: 'Asia/Colombo' },
                    { words: ['dhaka', 'bangladesh'], tz: 'Asia/Dhaka' },
                    { words: ['karachi', 'lahore', 'pakistan'], tz: 'Asia/Karachi' },
                    { words: ['kathmandu', 'nepal'], tz: 'Asia/Kathmandu' },
                    { words: ['jerusalem', 'tel aviv', 'israel'], tz: 'Asia/Jerusalem' },
                    { words: ['riyadh', 'saudi arabia'], tz: 'Asia/Riyadh' },
                    { words: ['tehran', 'iran'], tz: 'Asia/Tehran' },
                    // Oceania
                    { words: ['melbourne'], tz: 'Australia/Melbourne' },
                    { words: ['sydney'], tz: 'Australia/Sydney' },
                    { words: ['perth'], tz: 'Australia/Perth' },
                    { words: ['australia'], tz: 'Australia/Sydney' },
                    { words: ['auckland', 'wellington', 'new zealand'], tz: 'Pacific/Auckland' },
                    // Africa
                    { words: ['johannesburg', 'cape town', 'south africa'], tz: 'Africa/Johannesburg' },
                    { words: ['cairo', 'egypt'], tz: 'Africa/Cairo' },
                    { words: ['lagos', 'nigeria'], tz: 'Africa/Lagos' },
                    { words: ['nairobi', 'kenya'], tz: 'Africa/Nairobi' },
                    // South America
                    { words: ['rio de janeiro', 'sao paulo', 'brasilia', 'brazil'], tz: 'America/Sao_Paulo' },
                    { words: ['buenos aires', 'argentina'], tz: 'America/Argentina/Buenos_Aires' },
                    { words: ['santiago', 'chile'], tz: 'America/Santiago' },
                    { words: ['bogota', 'colombia'], tz: 'America/Bogota' },
                    { words: ['lima', 'peru'], tz: 'America/Lima' },
                    { words: ['mexico city', 'mexico'], tz: 'America/Mexico_City' },
                    // Canada
                    { words: ['toronto', 'montreal', 'ottawa'], tz: 'America/Toronto' },
                    { words: ['vancouver'], tz: 'America/Vancouver' },
                    { words: ['canada'], tz: 'America/Toronto' },
                ];

                // Scan input for any known country/city name — matches anywhere in the sentence
                let matchedLocation = null;
                let matchedTz = null;
                for (const entry of timezoneMap) {
                    for (const word of entry.words) {
                        // Use word boundary matching so "India" in "Indian" doesn't false-match
                        const regex = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
                        if (regex.test(input)) {
                            matchedLocation = word;
                            matchedTz = entry.tz;
                            break;
                        }
                    }
                    if (matchedLocation) break;
                }

                if (matchedLocation && matchedTz) {
                    const timeStr = now.toLocaleTimeString('en-US', { timeZone: matchedTz, hour: '2-digit', minute: '2-digit', hour12: true });
                    const dateStr = now.toLocaleDateString('en-US', { timeZone: matchedTz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                    const tzName = now.toLocaleTimeString('en-US', { timeZone: matchedTz, timeZoneName: 'short' }).split(' ').pop();
                    const locationDisplay = matchedLocation.charAt(0).toUpperCase() + matchedLocation.slice(1);
                    context.lastIntent = 'UTILITY';
                    return {
                        text: `In ${locationDisplay}, it is currently ${timeStr} ${tzName} on ${dateStr}.`,
                        toolExecuted: false,
                    };
                }

                // No location mentioned — show local computer time
                const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                context.lastIntent = 'UTILITY';
                return {
                    text: `It is currently ${timeStr} on ${dateStr}.`,
                    toolExecuted: false,
                };
            }

            // ---- Search / Question — strip leading query phrase and create cards ----
            if (/^(how|what|why|where|who|which|when|search|look up|find|google|youtube|show me|tell me)\b/i.test(lower)) {
                let searchQuery = input
                    .replace(/^(?:how\s+to|how\s+do\s+i|how\s+does|what\s+is|what\s+are|why\s+is|why\s+does|why\s+do|where\s+is|where\s+are|who\s+is|who\s+are|when\s+is|when\s+are|show\s+me|tell\s+me|search\s+for|look\s+up|google\s+|youtube\s+)\s*/i, '')
                    .trim();

                if (!searchQuery || searchQuery.length < 2) searchQuery = input;

                if (onStatusChange) onStatusChange('Searching the web for you...');

                await SheetsService.saveFact(
                    'Interests_Log',
                    searchQuery,
                    'Voice/Search Query',
                    `Searched on ${new Date().toLocaleTimeString()}`
                );

                const encodedQuery = encodeURIComponent(searchQuery);
                const cardPayload = {
                    title: searchQuery,
                    googleUrl: `https://www.google.com/search?q=${encodedQuery}`,
                    youtubeUrl: `https://www.youtube.com/results?search_query=${encodedQuery}`,
                    query: searchQuery,
                };

                context.lastIntent = 'UTILITY';

                return {
                    text: `I searched that for you on the dashboard.`,
                    cardPayload,
                    toolExecuted: true,
                    toolLogs: [`Logged search interest: ${searchQuery}`],
                };
            }

            return null;
        },
    },

    // ===== 6. SYSTEM ACTIONS =====
    // Uses Desktop Bridge when available (local environment, bridge running).
    // Falls back to browser-based wa.me links for WhatsApp (works on Vercel/cloud too).
    {
        name: 'SYSTEM_ACTION',
        priority: 40,
        keywords: ['open', 'launch', 'start', 'run', 'email', 'mail', 'draft', 'system', 'status', 'health', 'ram', 'cpu', 'terminal', 'code', 'whatsapp', 'send', 'text', 'message'],
        patterns: [
            // App launch
            /^(?:open|launch|start|run)\s+(.+)$/i,
            // WhatsApp send patterns
            /^(?:send|text|message)\s+(?:whatsapp\s+)?(?:message\s+)?(?:to\s+)?(.+?)\s+(?:to\s+)(\+?\d[\d\s\-\(\)]{7,}\d)$/i,
            /^(?:send|text|message)\s+(.+?)\s+(?:to|at)\s+(?:this\s+)?(?:number|phone|contact|whatsapp)\s+(\+?\d[\d\s\-\(\)]{7,}\d)$/i,
            /^send\s+(?:a\s+)?whatsapp\s+(?:message\s+)?(?:to\s+)?(\+?\d[\d\s\-\(\)]{7,}\d)\s+(?:saying|with|text|that)\s+(.+)$/i,
            // Broader WhatsApp/send patterns
            /^(?:send|text|message)\s+.+/i,
            /^whatsapp\s+.+/i,
            // Email drafting
            /\b(email|mail|draft email|send email|write email)\b/i,
            // System status / health
            /\b(system status|hardware|clear logs|system health|ram|cpu)\b/i,
        ],
        async handler(input, lower, { memoryFacts, context, onStatusChange }) {
            context.lastIntent = 'SYSTEM_ACTION';

            // ---- Helper: open wa.me link in new tab (browser fallback) ----
            const openWaMe = (phone, message) => {
                const cleanPhone = phone.replace(/[^\d+]/g, '');
                const encodedMsg = encodeURIComponent(message || '');
                const waUrl = `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
                if (typeof window !== 'undefined') {
                    window.open(waUrl, '_blank');
                }
                return waUrl;
            };

            // ---- Extract WhatsApp phone & message from input ----
            let waPhone = null;
            let waMessage = null;
            const phoneRegex = /(\+?\d[\d\s\-\(\)]{8,}\d)/;
            const phoneMatch = input.match(phoneRegex);
            if (phoneMatch && /^(?:send|text|message|whatsapp)/i.test(lower)) {
                waPhone = phoneMatch[1].trim();

                // Try to extract message from various patterns
                const afterColonMatch = input.match(/[:\;]\s*(.+?)$/);
                if (afterColonMatch) {
                    waMessage = afterColonMatch[1].trim();
                } else {
                    const msgBetween = input.match(/send\s+(?:this\s+)?(?:message\s+)?(.+?)\s+to\s+/i);
                    if (msgBetween) {
                        waMessage = msgBetween[1].trim();
                    } else {
                        const afterToMatch = input.match(/(?:send|text|message)\s+(?:this\s+)?(?:message\s+)?(.+?)\s+(?:to|at)\s+(?:this\s+)?(?:number|phone|no\.?|contact|whatsapp)\s*/i);
                        if (afterToMatch) {
                            waMessage = afterToMatch[1].trim();
                        }
                    }
                }
                // Clean up trailing "to this number/phone" in message
                if (waMessage) {
                    waMessage = waMessage.replace(/\s+to\s+(?:this\s+)?(?:number|phone|no\.?|contact|whatsapp)\s*$/i, '').trim();
                }
            }

            // ---- WhatsApp: try Desktop Bridge first, fall back to wa.me browser link ----
            if (waPhone && waMessage) {
                // Check if bridge is available
                const bridgeCheck = await BridgeService.checkBridgeAvailable();
                if (bridgeCheck.available) {
                    if (onStatusChange) onStatusChange(`Sending WhatsApp message to ${waPhone}...`);
                    const res = await BridgeService.sendWhatsApp(waPhone, waMessage);
                    if (res.success) {
                        return {
                            text: `WhatsApp message sent to ${waPhone} silently.`,
                            toolExecuted: true,
                            toolLogs: [`Sent WhatsApp to ${waPhone}: ${waMessage}`],
                        };
                    }
                }

                // Fallback: wa.me link in new tab (works everywhere — Vercel, local, etc.)
                openWaMe(waPhone, waMessage);
                return {
                    text: `Opening WhatsApp Web in a new tab with message pre-filled for ${waPhone}.`,
                    toolExecuted: true,
                    toolLogs: [`Opened wa.me for ${waPhone}`],
                };
            }

            // ---- "Open WhatsApp" (just launch, no message) ----
            const launchMatch = input.match(/^(?:open|launch|start|run)\s+(.+)$/i);
            if (launchMatch) {
                const target = launchMatch[1].trim().toLowerCase();

                // Special case: open whatsapp via browser if no bridge
                if (target === 'whatsapp' || target.includes('whatsapp')) {
                    const bridgeCheck = await BridgeService.checkBridgeAvailable();
                    if (bridgeCheck.available) {
                        const res = await BridgeService.launchApp(target);
                        if (res.success) {
                            return {
                                text: `Launched WhatsApp on your computer.`,
                                toolExecuted: true,
                                toolLogs: [`Launched WhatsApp via bridge`],
                            };
                        }
                    }

                    // Browser fallback
                    if (typeof window !== 'undefined') {
                        window.open('https://web.whatsapp.com', '_blank');
                    }
                    return {
                        text: `Opening WhatsApp Web in your browser.`,
                        toolExecuted: true,
                        toolLogs: ['Opened WhatsApp Web in browser'],
                    };
                }

                // For other apps, check if bridge is available
                const bridgeCheck = await BridgeService.checkBridgeAvailable();
                if (!bridgeCheck.available) {
                    return {
                        text: bridgeCheck.error || 'Desktop Bridge is not running. Start it with: node desktop-bridge/server.js',
                        toolExecuted: false,
                        toolLogs: ['Desktop Bridge unavailable'],
                    };
                }

                const appAliases = {
                    'vs code': 'vscode', 'code': 'vscode', 'editor': 'vscode',
                    'terminal': 'terminal', 'cmd': 'terminal', 'command prompt': 'terminal',
                    'powershell': 'powershell', 'notepad': 'notepad', 'calculator': 'calc',
                    'calc': 'calc', 'chrome': 'chrome', 'browser': 'msedge', 'edge': 'msedge',
                    'spotify': 'spotify', 'slack': 'slack',
                };
                const resolvedApp = appAliases[target] || target.replace(/[^a-z0-9_-]/g, '');

                if (onStatusChange) onStatusChange(`Executing: Launch ${resolvedApp}`);
                const res = await BridgeService.launchApp(resolvedApp);

                if (res.success) {
                    return {
                        text: `Launched ${resolvedApp} on your computer via Desktop Bridge.`,
                        toolExecuted: true,
                        toolLogs: [`Launched OS app: ${resolvedApp}`],
                    };
                }
                return {
                    text: `Attempted to launch ${resolvedApp}. ${res.error || 'Desktop Bridge helper not responding at localhost:3001.'}`,
                    toolExecuted: true,
                    toolLogs: [`Failed launching ${resolvedApp}`],
                };
            }

            // ---- Email Draft ----
            if (/\b(email|mail|draft email|send email|write email)\b/i.test(lower)) {
                const bridgeCheck = await BridgeService.checkBridgeAvailable();
                if (!bridgeCheck.available) {
                    return {
                        text: bridgeCheck.error || 'Desktop Bridge is not running. Start it with: node desktop-bridge/server.js',
                        toolExecuted: false,
                        toolLogs: ['Desktop Bridge unavailable'],
                    };
                }

                const emailToMatch = input.match(/\bto\s+([^\s@]+@[^\s@]+\.[^\s@]+|[a-zA-Z0-9]+)\b/i);
                const recipient = emailToMatch ? emailToMatch[1] : '';
                const subjectMatch = input.match(/subject\s+["']?([^"']+)["']?/i);
                const subject = subjectMatch ? subjectMatch[1] : 'Update from Charlie Dashboard';

                if (onStatusChange) onStatusChange('Executing: Draft Email');
                const res = await BridgeService.draftEmail({
                    to: recipient, subject,
                    body: `Hello,\n\nDraft created from your local Charlie AI command dashboard.\n\nBest regards.`,
                });

                return {
                    text: res.success ? `Opened email draft for "${subject}".` : `Could not open mail client via Desktop Bridge.`,
                    toolExecuted: true,
                    toolLogs: ['Triggered mailto handler'],
                };
            }

            // ---- System Status ----
            if (/\b(system status|hardware|clear logs|system health|ram|cpu)\b/i.test(lower)) {
                const bridgeCheck = await BridgeService.checkBridgeAvailable();
                if (!bridgeCheck.available) {
                    return {
                        text: bridgeCheck.error || 'Desktop Bridge is not running. Start it with: node desktop-bridge/server.js',
                        toolExecuted: false,
                        toolLogs: ['Desktop Bridge unavailable'],
                    };
                }

                if (onStatusChange) onStatusChange('Fetching System Status...');
                const res = await BridgeService.getSystemStatus();
                if (res.success && res.data) {
                    return {
                        text: `System Status: ${res.data.cpus} CPUs, ${res.data.freeMem} free RAM out of ${res.data.totalMem}.`,
                        toolExecuted: true,
                    };
                }
                return {
                    text: `Could not reach Desktop Bridge helper server at http://localhost:3001.`,
                    toolExecuted: false,
                };
            }

            return null;
        },
    },
];

// ---------------------------------------------------------------------------
// Helper: capitalize words
// ---------------------------------------------------------------------------
function capitalizeWords(str) {
    return str.replace(/\b\w/g, char => char.toUpperCase());
}

// ---------------------------------------------------------------------------
// BrainEngine Class
// ---------------------------------------------------------------------------
export class BrainEngine {
    constructor() {
        // Global conversation context — persists across `processInput` calls
        this.context = {
            lastIntent: null,
            activeTopic: null,
            lastSavedFact: null,
            pendingSlot: null,
        };
    }

    /**
     * Main entry point: process user input and return a response.
     * @param {string} rawInput - The raw user text
     * @param {Object} memoryFacts - Current memory facts from SheetsService
     * @param {Function} onStatusChange - Status callback
     * @returns {Promise<{text: string, cardPayload?: Object, toolExecuted: boolean, toolLogs?: string[]}>}
     */
    async processInput(rawInput, memoryFacts = {}, onStatusChange = () => { }) {
        if (!rawInput || !rawInput.trim()) {
            return { text: "I didn't receive any command. How can I help you?", toolExecuted: false };
        }

        const input = rawInput.trim();
        const lower = input.toLowerCase();

        if (onStatusChange) onStatusChange('Brain Engine: Processing input...');

        // ---- Step 1: Try fuzzy keyword scoring to find best intent category ----
        const scoredCategories = INTENT_CATEGORIES.map(cat => ({
            ...cat,
            score: keywordScore(lower, cat.keywords),
        })).sort((a, b) => {
            // Sort by score descending, then priority (lower number = higher priority)
            if (b.score !== a.score) return b.score - a.score;
            return a.priority - b.priority;
        });

        // ---- Step 2: Try pattern matching against each category in priority order ----
        // First try by priority order (strict pattern matching)
        const sortedByPriority = [...INTENT_CATEGORIES].sort((a, b) => a.priority - b.priority);

        for (const category of sortedByPriority) {
            for (const pattern of category.patterns) {
                if (pattern.test(lower)) {
                    const result = await category.handler(input, lower, {
                        memoryFacts,
                        context: this.context,
                        onStatusChange,
                    });
                    if (result) {
                        if (onStatusChange) onStatusChange(result.toolExecuted ? 'Task Executed Successfully' : 'Idle / Ready');
                        return result;
                    }
                }
            }
        }

        // ---- Step 3: If no pattern matched, try fuzzy-matched categories ----
        const bestFuzzy = scoredCategories.find(c => c.score >= 3);
        if (bestFuzzy) {
            for (const pattern of bestFuzzy.patterns) {
                const result = await bestFuzzy.handler(input, lower, {
                    memoryFacts,
                    context: this.context,
                    onStatusChange,
                });
                if (result) {
                    if (onStatusChange) onStatusChange(result.toolExecuted ? 'Task Executed Successfully' : 'Idle / Ready');
                    return result;
                }
            }
        }

        // ---- Step 4: Check if there's a pending slot — treat input as slot filler ----
        if (this.context.pendingSlot) {
            const slotKey = capitalizeWords(this.context.pendingSlot);
            const value = input.trim();

            if (onStatusChange) onStatusChange(`Updating Memory: [${slotKey}]`);
            const result = await SheetsService.saveFact('Identity_Facts', slotKey, value, 'Filled pending slot via BrainEngine');
            this.context.lastSavedFact = { key: slotKey, value, category: 'Identity_Facts' };
            this.context.pendingSlot = null;
            this.context.lastIntent = 'IDENTITY';

            return {
                text: slotKey === 'Name'
                    ? `Nice to meet you, ${value}! I've saved your name.`
                    : `Got it! I've saved "${slotKey}: ${value}".`,
                toolExecuted: true,
                toolLogs: [`Pending slot filled: ${slotKey} -> ${value}`],
                updatedFacts: result.facts,
            };
        }

        // ---- Step 5: Graceful fallback — create search card, never throw generic error ----
        if (onStatusChange) onStatusChange('Searching the web for you...');

        // Log as interest
        await SheetsService.saveFact(
            'Interests_Log',
            input,
            'Fallback Query',
            `Searched on ${new Date().toLocaleTimeString()}`
        );

        const encodedQuery = encodeURIComponent(input);
        const cardPayload = {
            title: input,
            googleUrl: `https://www.google.com/search?q=${encodedQuery}`,
            youtubeUrl: `https://www.youtube.com/results?search_query=${encodedQuery}`,
            query: input,
        };

        return {
            text: `I searched that for you on the dashboard.`,
            cardPayload,
            toolExecuted: true,
            toolLogs: [`Fallback: created search card for "${input}"`],
        };
    }

    /**
     * Reset the conversation context (e.g., on settings change or manual clear).
     */
    resetContext() {
        this.context = {
            lastIntent: null,
            activeTopic: null,
            lastSavedFact: null,
            pendingSlot: null,
        };
    }

    /**
     * Get current context snapshot (for debugging / UI).
     */
    getContext() {
        return { ...this.context };
    }
}

// Singleton instance for app-wide use
export const brainEngine = new BrainEngine();

