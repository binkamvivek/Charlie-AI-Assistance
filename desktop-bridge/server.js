import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ============================================================================
// WhatsApp Background Client — uses whatsapp-web.js with session persistence
// ============================================================================
let waClient = null;
let waStatus = 'uninitialized'; // uninitialized | initializing | ready | disconnected | error
let waError = null;
let currentQrCode = null; // stores the raw QR string for the /whatsapp/qr endpoint
let qrCodeResolvers = []; // for polling/streaming

function cleanupStaleLocks() {
  const sessionDir = path.resolve('./whatsapp-data/session');
  if (fs.existsSync(sessionDir)) {
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    for (const file of lockFiles) {
      const lockPath = path.join(sessionDir, file);
      try {
        if (fs.existsSync(lockPath)) {
          fs.unlinkSync(lockPath);
          console.log('  [Cleanup] Removed stale lock file:', file);
        }
      } catch (e) {
        console.log('  [Cleanup] Could not remove', file, '- may be in use');
      }
    }
    const cacheLockPath = path.join(sessionDir, 'Default', 'Cache', 'Cache_Data', 'sqldb0');
    try {
      if (fs.existsSync(cacheLockPath)) {
        fs.unlinkSync(cacheLockPath);
      }
    } catch (e) { /* ignore */ }
  }
}

function initWhatsAppClient() {
  if (waClient) return;

  waStatus = 'initializing';
  console.log('[WhatsApp] Initializing background client...');

  // Clean up stale Puppeteer lock files from previous crashes
  cleanupStaleLocks();

  waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: './whatsapp-data' }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--mute-audio',
      ],
    },
  });

  waClient.on('qr', (qr) => {
    waStatus = 'qr_needed';
    currentQrCode = qr;
    // Notify all pending resolvers
    qrCodeResolvers.forEach(r => r(qr));
    qrCodeResolvers = [];
    console.log('⚠️  =============================================');
    console.log('⚠️  WhatsApp QR code needed!');
    console.log('⚠️  Open http://localhost:3001/qr in your browser to scan');
    console.log('⚠️  =============================================');
  });

  waClient.on('ready', () => {
    waStatus = 'ready';
    waError = null;
    console.log('✅ [WhatsApp] Background client is ready! Messages will be sent silently.');
  });

  waClient.on('authenticated', () => {
    console.log('✅ [WhatsApp] Session authenticated and saved.');
  });

  waClient.on('auth_failure', (msg) => {
    waStatus = 'error';
    waError = msg;
    console.error('❌ [WhatsApp] Authentication failure:', msg);
  });

  waClient.on('disconnected', async (reason) => {
    waStatus = 'disconnected';
    console.log('[WhatsApp] Disconnected:', reason);

    if (reason === 'LOGOUT') {
      // Session was revoked — destroy old client and clean up session data
      console.log('[WhatsApp] Session was logged out. Cleaning up and preparing for fresh auth...');
      try {
        waClient.destroy();
      } catch (_) { /* ignore destroy errors */ }
      waClient = null;
      currentQrCode = null;

      // Remove all session data so next init starts fresh
      const waDataPath = path.resolve('./whatsapp-data');
      try {
        fs.rmSync(waDataPath, { recursive: true, force: true });
        console.log('  [Cleanup] Removed all session data');
      } catch (e) {
        console.log('  [Cleanup] Could not remove session data:', e.message);
      }

      // Create a fresh client after a short delay
      setTimeout(() => {
        console.log('[WhatsApp] Re-initializing with fresh session...');
        initWhatsAppClient();
      }, 3000);
    } else {
      // Temporary disconnect — try to reconnect
      setTimeout(() => {
        console.log('[WhatsApp] Attempting reconnection...');
        waClient.initialize().catch((err) => {
          console.error('[WhatsApp] Reconnection failed:', err.message);
        });
      }, 5000);
    }
  });

  waClient.initialize().catch((err) => {
    waStatus = 'error';
    waError = err.message;
    console.error('❌ [WhatsApp] Initialization error:', err.message);
  });
}

// Initialize WhatsApp client on startup
initWhatsAppClient();

// ============================================================================
// System app mapping for Windows / OS
// ============================================================================
const APP_COMMANDS = {
  terminal: process.platform === 'win32' ? 'start cmd' : 'open -a Terminal',
  cmd: process.platform === 'win32' ? 'start cmd' : 'open -a Terminal',
  powershell: process.platform === 'win32' ? 'start powershell' : 'open -a Terminal',
  vscode: process.platform === 'win32' ? 'code .' : 'code .',
  code: process.platform === 'win32' ? 'code .' : 'code .',
  notepad: process.platform === 'win32' ? 'start notepad' : 'open -a TextEdit',
  calculator: process.platform === 'win32' ? 'start calc' : 'open -a Calculator',
  calc: process.platform === 'win32' ? 'start calc' : 'open -a Calculator',
  browser: process.platform === 'win32' ? 'start msedge' : 'open -a Safari',
  chrome: process.platform === 'win32' ? 'start chrome' : 'open -a "Google Chrome"',
  whatsapp: process.platform === 'win32' ? 'start whatsapp' : 'open -a "WhatsApp"',
  wa: process.platform === 'win32' ? 'start whatsapp' : 'open -a "WhatsApp"',
  spotify: process.platform === 'win32' ? 'start spotify' : 'open -a Spotify',
  slack: process.platform === 'win32' ? 'start slack' : 'open -a Slack',
  msedge: process.platform === 'win32' ? 'start msedge' : 'open -a "Microsoft Edge"'
};

function getLaunchCommand(appName) {
  const known = APP_COMMANDS[appName.toLowerCase()];
  if (known) return known;

  if (process.platform === 'win32') {
    const safeName = appName.replace(/'/g, "''");
    const script = `$app = Get-StartApps | Where-Object { $_.Name -like '*${safeName}*' } | Select-Object -First 1; if ($app) { explorer.exe ('shell:AppsFolder\\' + $app.AppId) } else { Start-Process -FilePath '${safeName}' -ErrorAction SilentlyContinue; if (-not $?) { Write-Error 'App not found: ${safeName}' } }`;
    const bytes = Buffer.from(script, 'utf16le').toString('base64');
    return `powershell -NoProfile -EncodedCommand ${bytes}`;
  }

  return `open -a "${appName}"`;
}

// ============================================================================
// API Routes
// ============================================================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    system: os.type(),
    platform: process.platform,
    hostname: os.hostname(),
    waStatus,
    timestamp: new Date().toISOString()
  });
});

// WhatsApp status endpoint
app.get('/whatsapp/status', (req, res) => {
  res.json({
    status: waStatus,
    ready: waStatus === 'ready',
    error: waError,
  });
});

// WhatsApp QR scan page — embedded in the bridge itself (no second client needed)
app.get('/whatsapp/qr', async (req, res) => {
  if (waStatus === 'ready') {
    return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>WhatsApp - Charlie AI</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#0f172a,#1e293b);min-height:100vh;display:flex;justify-content:center;align-items:center;color:#e2e8f0}.container{background:#1e293b;border-radius:24px;padding:40px;max-width:500px;width:90%;text-align:center;border:1px solid #334155;box-shadow:0 20px 60px rgba(0,0,0,0.5)}h1{font-size:24px;color:#38bdf8}.status{background:#d1fae5;color:#065f46;padding:12px 20px;border-radius:12px;font-weight:500}</style></head><body><div class="container"><h1>✅ WhatsApp Connected</h1><p class="status">Your WhatsApp is already authenticated! Messages will be sent silently in the background.</p></div>  </div>
</body></html>`);
  }
  if (!currentQrCode) {
    return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>WhatsApp QR - Charlie AI</title><meta http-equiv="refresh" content="2"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#0f172a,#1e293b);min-height:100vh;display:flex;justify-content:center;align-items:center;color:#e2e8f0}.container{background:#1e293b;border-radius:24px;padding:40px;max-width:500px;width:90%;text-align:center;border:1px solid #334155}</style></head><body><div class="container"><h1 style="color:#38bdf8">⏳ Generating QR Code...</h1><p style="color:#94a3b8">Please wait, the QR code will appear shortly...</p></div></body></html>`);
  }
  try {
    const { default: qrcode } = await import('qrcode');
    const qrSvg = await qrcode.toString(currentQrCode, { type: 'svg', width: 280, margin: 1 });
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp QR - Charlie AI</title>
  <meta http-equiv="refresh" content="3">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      color: #e2e8f0;
    }
    .container {
      background: #1e293b;
      border-radius: 24px;
      padding: 40px;
      max-width: 500px;
      width: 90%;
      text-align: center;
      border: 1px solid #334155;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    h1 { font-size: 24px; margin-bottom: 8px; color: #38bdf8; }
    .subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 30px; }
    .qr-container { background: white; border-radius: 16px; padding: 20px; display: inline-block; margin-bottom: 20px; }
    .qr-container svg { width: 280px; height: 280px; }
    .status { padding: 12px 20px; border-radius: 12px; font-weight: 500; margin-bottom: 16px; }
    .status.waiting { background: #fef3c7; color: #92400e; }
    .status.connected { background: #d1fae5; color: #065f46; }
    .steps { text-align: left; background: #0f172a; border-radius: 12px; padding: 16px 20px; font-size: 13px; line-height: 1.8; }
    .steps li { margin-bottom: 4px; color: #cbd5e1; }
    .steps strong { color: #38bdf8; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔗 WhatsApp Authentication</h1>
    <p class="subtitle">Scan this QR code with WhatsApp on your phone</p>
    <div class="qr-container">${qrSvg}</div>
    <div class="status waiting">⏳ Waiting for scan...</div>
    <div class="steps">
      <strong>Steps:</strong>
      <ol>
        <li>Open <strong>WhatsApp</strong> on your phone</li>
        <li>Tap <strong>Menu</strong> (⋮) → <strong>Linked Devices</strong> → <strong>Link a Device</strong></li>
        <li>Scan the QR code above</li>
        <li>Once connected, refresh this page — it will show ✅ Connected</li>
      </ol>
    </div>
</body>
</html>`;
    res.send(html);
  } catch (e) {
    res.status(500).send('QR generation error: ' + e.message);
  }
});

// WhatsApp QR data endpoint — returns QR as base64 data URI for inline dashboard display
app.get('/whatsapp/qr-data', async (req, res) => {
  if (waStatus === 'ready') {
    return res.json({ ready: true, waStatus: 'ready' });
  }
  if (!currentQrCode) {
    return res.json({ ready: false, waStatus: waStatus, qrDataUri: null });
  }
  try {
    const { default: qrcode } = await import('qrcode');
    const qrDataUri = await qrcode.toDataURL(currentQrCode, { width: 280, margin: 1 });
    res.json({ ready: false, waStatus: 'qr_needed', qrDataUri });
  } catch (e) {
    res.json({ ready: false, waStatus: 'error', error: e.message });
  }
});

// Shortcut: /qr redirects to /whatsapp/qr
app.get('/qr', (req, res) => {
  res.redirect('/whatsapp/qr');
});

// WhatsApp send message — SILENTLY in background, no browser windows open
app.post('/whatsapp/send', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone) {
    return res.status(400).json({ success: false, error: 'Phone number is required' });
  }
  if (!message) {
    return res.status(400).json({ success: false, error: 'Message is required' });
  }

  if (waStatus !== 'ready') {
    return res.status(503).json({
      success: false,
      error: waStatus === 'qr_needed'
        ? 'WhatsApp not authenticated yet. Scan the QR code displayed in the dashboard to link your WhatsApp.'
        : `WhatsApp client is ${waStatus}. Please wait for it to be ready.`,
      waStatus,
    });
  }

  // Format phone number: remove all non-digit chars except +
  let cleanPhone = phone.replace(/[^\d+]/g, '');
  // Ensure it has country code (add @c.us suffix for whatsapp-web.js)
  if (!cleanPhone.includes('@c.us')) {
    // If no +, assume it's a full number
    if (!cleanPhone.startsWith('+')) {
      cleanPhone = '+' + cleanPhone;
    }
    cleanPhone = cleanPhone.replace(/[^0-9+]/g, '') + '@c.us';
  }

  console.log(`[WhatsApp] Sending message to ${cleanPhone} in background...`);

  try {
    // Send directly — isRegisteredUser is unreliable and can crash
    const sent = await waClient.sendMessage(cleanPhone, message);
    console.log(`[WhatsApp] Message sent successfully to ${cleanPhone} (ID: ${sent.id.id})`);

    return res.json({
      success: true,
      message: `WhatsApp message sent to ${phone}`,
      messageId: sent.id.id,
      background: true,
    });
  } catch (err) {
    console.error(`[WhatsApp] Send failed:`, err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to send WhatsApp message',
    });
  }
});

// Main execute endpoint (existing functionality)
app.post('/execute', (req, res) => {
  const { command, target, subject, body, to, phone, message } = req.body;
  console.log(`[Bridge Execution Request]: command=${command}, target=${target}`);

  // Route WhatsApp commands to the background client
  if (command === 'send_whatsapp') {
    // Forward to the WhatsApp send handler
    return app._handleWhatsAppSend(req, res);
  }

  // Handlers for specific commands
  if (command === 'launch_app' || command === 'open_app') {
    const appKey = (target || '').trim();
    const sysCmd = getLaunchCommand(appKey);

    console.log(`[Bridge] Launching: ${appKey} -> ${sysCmd}`);

    exec(sysCmd, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Bridge] Launch failed: ${error.message}`);
        console.error(`[Bridge] stderr: ${stderr}`);
        return res.status(500).json({ success: false, error: error.message, stderr });
      }
      if (stderr) {
        console.warn(`[Bridge] Launch had warnings: ${stderr}`);
      }
      return res.json({ success: true, message: `Launched ${appKey}` });
    });
    return;
  }

  if (command === 'draft_email' || command === 'email') {
    const recipient = to || '';
    const mailSubject = encodeURIComponent(subject || 'Message from Charlie AI Assistant');
    const mailBody = encodeURIComponent(body || 'Sent via Charlie AI Assistant Desktop Bridge');
    const mailtoUrl = `mailto:${recipient}?subject=${mailSubject}&body=${mailBody}`;

    const openCmd = process.platform === 'win32' ? `start "" "${mailtoUrl}"` : `open "${mailtoUrl}"`;

    exec(openCmd, (error) => {
      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
      return res.json({ success: true, message: 'Email draft opened in default client' });
    });
    return;
  }

  if (command === 'system_status') {
    return res.json({
      success: true,
      data: {
        cpus: os.cpus().length,
        freeMem: `${Math.round(os.freemem() / 1024 / 1024)} MB`,
        totalMem: `${Math.round(os.totalmem() / 1024 / 1024)} MB`,
        uptime: `${Math.round(os.uptime() / 60)} minutes`
      }
    });
  }

  // Fallback direct command execution for supported safe actions
  if (command === 'raw_shell' && target) {
    exec(target, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
      return res.json({ success: true, output: stdout || stderr });
    });
    return;
  }

  return res.status(400).json({ success: false, error: 'Unknown or unsupported command action' });
});

// Mount the WhatsApp send handler
app._handleWhatsAppSend = async (req, res) => {
  const { phone, message } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, error: 'Phone number is required' });
  }

  if (waStatus !== 'ready') {
    return res.status(503).json({
      success: false,
      error: waStatus === 'qr_needed'
        ? 'WhatsApp not authenticated yet. Scan the QR code displayed in the dashboard to link your WhatsApp.'
        : `WhatsApp client is ${waStatus}. Please wait for it to be ready.`,
      waStatus,
    });
  }

  let cleanPhone = phone.replace(/[^\d+]/g, '');
  if (!cleanPhone.startsWith('+')) {
    cleanPhone = '+' + cleanPhone;
  }
  const chatId = cleanPhone.replace(/[^0-9+]/g, '') + '@c.us';

  console.log(`[WhatsApp] Sending message to ${chatId} in background...`);

  try {
    // Send directly — isRegisteredUser is unreliable and can crash
    const sent = await waClient.sendMessage(chatId, message || '');
    console.log(`[WhatsApp] Message sent successfully (ID: ${sent.id.id})`);

    return res.json({
      success: true,
      message: `WhatsApp message sent to ${phone}`,
      messageId: sent.id.id,
      background: true,
    });
  } catch (err) {
    console.error(`[WhatsApp] Send failed:`, err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to send WhatsApp message',
    });
  }
};

// Start server
app.listen(PORT, () => {
  console.log('============================================');
  console.log(`  🤖 Charlie AI Desktop Bridge`);
  console.log(`  Running on http://localhost:${PORT}`);
  console.log(`  WhatsApp: ${waStatus === 'ready' ? '✅ Ready' : '⏳ Initializing...'}`);
  console.log('============================================');
});
