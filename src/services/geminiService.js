/**
 * Gemini Service - Connects with Gemini model with Autonomous Function Calling Tools
 */
import { GoogleGenAI } from '@google/genai/web';
import { SheetsService } from './sheetsService';
import { BridgeService } from './bridgeService';

// Function calling declarations for Gemini tool schema
const MEMORY_TOOLS = [
  {
    name: 'save_fact',
    description: 'Autonomous tool to save or update a user preference, identity fact, technical stack, or routine in memory.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: {
          type: 'STRING',
          description: 'Category of memory: Identity_Facts, Interests_Log, or Task_Routines',
          enum: ['Identity_Facts', 'Interests_Log', 'Task_Routines']
        },
        key: {
          type: 'STRING',
          description: 'The key/attribute name (e.g., Preferred_Language, Goal, Tech_Stack, Favorite_Topic)'
        },
        value: {
          type: 'STRING',
          description: 'The value to associate with this key'
        },
        details: {
          type: 'STRING',
          description: 'Additional context or explanation of the fact'
        }
      },
      required: ['key', 'value']
    }
  },
  {
    name: 'delete_fact',
    description: 'Delete a fact from user memory when explicitly requested or contradicted.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: {
          type: 'STRING',
          enum: ['Identity_Facts', 'Interests_Log', 'Task_Routines']
        },
        key: {
          type: 'STRING',
          description: 'Key of the fact to remove'
        }
      },
      required: ['key']
    }
  },
  {
    name: 'launch_desktop_app',
    description: 'Launch any application installed on the user computer. Works with any installed program by name.',
    parameters: {
      type: 'OBJECT',
      properties: {
        appName: {
          type: 'STRING',
          description: 'Name of application to launch (e.g. whatsapp, vscode, spotify, slack, terminal, notepad, chrome, calc)'
        }
      },
      required: ['appName']
    }
  },
  {
    name: 'draft_email',
    description: 'Open default mail client with pre-filled subject and body text.',
    parameters: {
      type: 'OBJECT',
      properties: {
        to: { type: 'STRING', description: 'Recipient email address' },
        subject: { type: 'STRING', description: 'Subject line' },
        body: { type: 'STRING', description: 'Main email body content' }
      },
      required: ['subject', 'body']
    }
  }
];

export class GeminiService {
  static getApiKey() {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('charlie_gemini_api_key') || '';
    }
    return '';
  }

  static async generateResponse(userMessage, currentFacts, onStatusChange) {
    const apiKey = this.getApiKey();

    // Contextual system prompt
    const systemInstruction = `
You are "Charlie", a hyper-personalized, voice-enabled AI Assistant operating in a full-screen Bento Grid dashboard.
You have continuous access to the user's self-organizing memory profile stored in Google Sheets.

CURRENT USER MEMORY FACTS:
${JSON.stringify(currentFacts, null, 2)}

INSTRUCTIONS:
1. Provide helpful, concise, engaging, and direct responses appropriate for a voice & chat assistant.
2. If the user mentions a new fact, preference, goal, or tech stack detail (e.g. "I learned C++ today" or "Set my email routine"), AUTONOMOUSLY call the 'save_fact' tool to save or overwrite facts in memory.
3. If the user asks to launch an application (e.g. "Open terminal", "Open VS Code", "Launch notepad"), call the 'launch_desktop_app' tool.
4. If the user asks to draft an email, call the 'draft_email' tool.
`;

    if (!apiKey) {
      // Graceful fallback mock response when key isn't provided yet
      return this.handleFallbackResponse(userMessage, currentFacts, onStatusChange);
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      if (onStatusChange) onStatusChange('Thinking...');

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [
          { role: 'user', parts: [{ text: systemInstruction + "\nUser Request: " + userMessage }] }
        ],
        config: {
          tools: [{ functionDeclarations: MEMORY_TOOLS }]
        }
      });

      // Check if tool calls were triggered
      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        let toolLogs = [];
        for (const call of functionCalls) {
          const { name, args } = call;
          if (onStatusChange) onStatusChange(`Executing: ${name}`);

          if (name === 'save_fact') {
            await SheetsService.saveFact(args.category || 'Identity_Facts', args.key, args.value, args.details || '');
            toolLogs.push(`Updated memory: [${args.key}] = ${args.value}`);
          } else if (name === 'delete_fact') {
            await SheetsService.deleteFact(args.category || 'Identity_Facts', args.key);
            toolLogs.push(`Deleted fact: ${args.key}`);
          } else if (name === 'launch_desktop_app') {
            const res = await BridgeService.launchApp(args.appName);
            if (res.success) {
              toolLogs.push(`Launched ${args.appName}`);
            } else {
              toolLogs.push(`Could not launch ${args.appName}: ${res.error || 'Desktop Bridge not running (run: npm run bridge)'}`);
            }
          } else if (name === 'draft_email') {
            const res = await BridgeService.draftEmail(args);
            toolLogs.push(res.success ? `Opened email draft: "${args.subject}"` : `Failed to open email client`);
          }
        }

        const replyText = response.text || `Executed task: ${toolLogs.join('; ')}`;
        return { text: replyText, toolExecuted: true, toolLogs };
      }

      return { text: response.text || "I'm here to help!", toolExecuted: false };
    } catch (err) {
      console.error('Gemini API Error:', err);
      return this.handleFallbackResponse(userMessage, currentFacts, onStatusChange, err.message);
    }
  }

  static async handleFallbackResponse(userMessage, currentFacts, onStatusChange, errorMsg = '') {
    const msg = userMessage.toLowerCase();

    if (msg.includes('open') || msg.includes('launch')) {
      // Extract the app name from the message (word after "open" or "launch")
      const words = userMessage.split(/\s+/);
      const openIdx = words.findIndex(w => w.toLowerCase() === 'open' || w.toLowerCase() === 'launch');
      let appName = 'vscode';
      if (openIdx !== -1 && openIdx + 1 < words.length) {
        appName = words[openIdx + 1].replace(/[^a-zA-Z0-9]/g, '');
      }
      // Known app name mappings for fallback
      const known = {
        terminal: 'terminal', cmd: 'terminal', powershell: 'powershell',
        code: 'code', vscode: 'code', 'vs code': 'code',
        notepad: 'notepad', calc: 'calc', calculator: 'calc',
        chrome: 'chrome', browser: 'msedge', edge: 'msedge',
      };
      appName = known[appName.toLowerCase()] || appName;

      if (onStatusChange) onStatusChange(`Executing Task: Launch ${appName}`);
      const res = await BridgeService.launchApp(appName);
      return {
        text: res.success ? `Launching ${appName} on your computer.` : `Attempted to launch ${appName}. Please ensure Desktop Bridge is running at http://localhost:3001.`,
        toolExecuted: true
      };
    }

    if (msg.includes('email') || msg.includes('draft')) {
      if (onStatusChange) onStatusChange('Executing Task: Draft Email');
      const res = await BridgeService.draftEmail({ subject: 'Quick Note', body: 'Draft created from Charlie AI' });
      return {
        text: res.success ? 'Opening your default mail client with a new email draft.' : 'Could not reach Desktop Bridge helper.',
        toolExecuted: true
      };
    }

    if (msg.includes('memory') || msg.includes('facts') || msg.includes('who am i')) {
      return {
        text: `Based on your memory graph, your primary role is ${currentFacts.Identity_Facts[1]?.Value || 'Engineer'} working with ${currentFacts.Identity_Facts[2]?.Value || 'React and Python'}.`,
        toolExecuted: false
      };
    }

    if (!errorMsg) {
      return {
        text: `Hello! I'm Charlie, your AI assistant. Configure your Gemini API key in Settings for full autonomous function calling!`,
        toolExecuted: false
      };
    }

    return {
      text: `Gemini API Error: ${errorMsg}. Check the browser console (F12) for details.`,
      toolExecuted: false
    };
  }
}
