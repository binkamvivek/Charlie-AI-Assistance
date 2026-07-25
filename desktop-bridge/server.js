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
app.use(express.json({ limit: '50mb' }));

// ============================================================================
// In-Memory WhatsApp Message Queue
// Persisted across disconnects; auto-sent when client becomes ready.
// Also backed up to Google Sheets for crash recovery.
// ============================================================================
const messageQueue = []; // Array of { phone, message, timestamp }

// ============================================================================
// Sheets Web App URL (for queue persistence backup)
// ============================================================================
const SHEETS_WEB_APP_URL = process.env.CHARLIE_SHEETS_URL || '';

// ============================================================================
// Queue Management Helpers
// ============================================================================

/**
 * Backup a queued message to Google Sheets (async, best-effort).
 */
async function backupQueueToSheets(phone, message) {
  if (!SHEETS_WEB_APP_URL) return;
  try {
    const params = new URLSearchParams({
      action: 'queue_message',
      phone,
      message,
      _t: Date.now()
    });
    await fetch(`${SHEETS_WEB_APP_URL}?${params.toString()}`);
  } catch (e) {
    console.log('  [Queue] Sheets backup failed:', e.message);
  }
}

/**
 * Remove a queued message from Google Sheets backup (async, best-effort).
 */
async function removeFromSheetsBackup(phone, message) {
  if (!SHEETS_WEB_APP_URL) return;
  try {
    const params = new URLSearchParams({
      action: 'clear_queued_message',
      phone,
      message,
      _t: Date.now()
    });
    await fetch(`${SHEETS_WEB_APP_URL}?${params.toString()}`);
  } catch (e) {
    console.log('  [Queue] Sheets removal failed:', e.message);
  }
}

/**
 * Load queued messages from Google Sheets (for crash recovery).
 */
async function loadQueueFromSheets() {
  if (!SHEETS_WEB_APP_URL) return;
  try {
    const params = new URLSearchParams({ action: 'get_queued_messages', _t: Date.now() });
    const response = await fetch(`${SHEETS_WEB_APP_URL}?${params.toString()}`);
    const data = await response.json();
    if (data.status === 'success' && data.data) {
      let loaded = 0;
      for (const item of data.data) {
        const phone = item.Phone || '';
        const message = item.Message || '';
        const status = (item.Status || '').toLowerCase();
        if (phone && message && status === 'pending') {
          // Avoid duplicates
          const exists = messageQueue.some(e => e.phone === phone && e.message === message);
          if (!exists) {
            messageQueue.push({ phone, message, timestamp: item.Timestamp || new Date().toISOString() });
            loaded++;
          }
        }
      }
      if (loaded > 0) {
        console.log(`[Queue] Loaded ${loaded} pending message(s) from Google Sheets backup.`);
      }
    }
  } catch (e) {
    console.log('  [Queue] Could not load from Sheets:', e.message);
  }
}

/**
 * Add a message to the queue. Returns the queue length.
 */
function addToQueue(phone, message) {
  const entry = { phone, message, timestamp: new Date().toISOString() };
  messageQueue.push(entry);
  console.log(`[Queue] Message queued for ${phone}. Queue length: ${messageQueue.length}`);

  // Backup to Google Sheets (async)
  backupQueueToSheets(phone, message);

  return messageQueue.length;
}

/**
 * Send all queued messages via the WhatsApp client.
 * Returns { sent: number, failed: { phone, message, error }[] }
 */
async function flushQueue() {
  if (messageQueue.length === 0) return { sent: 0, failed: [] };
  if (!waClient || waStatus !== 'ready') {
    console.log(`[Queue] Cannot flush — client not ready (status: ${waStatus})`);
    return { sent: 0, failed: messageQueue.map(e => ({ phone: e.phone, message: e.message, error: 'Client not ready' })) };
  }

  console.log(`[Queue] Flushing ${messageQueue.length} queued message(s)...`);
  const sent = [];
  const failed = [];

  while (messageQueue.length > 0) {
    const entry = messageQueue.shift();
    try {
      // Format phone: remove everything except digits, then add @c.us
      const cleanPhone = entry.phone.replace(/[^\d]/g, '');
      const chatId = cleanPhone + '@c.us';

      console.log(`[Queue] Sending to ${chatId}...`);
      const result = await waClient.sendMessage(chatId, entry.message);
      const resultId = result && result.id ? result.id.id : 'unknown';
      console.log(`[Queue] ✅ Sent to ${cleanPhone} (ID: ${resultId})`);
      sent.push(entry.phone);

      // Remove from sheets backup
      await removeFromSheetsBackup(entry.phone, entry.message);
    } catch (err) {
      const errorMsg = err && err.message ? err.message : (err ? String(err) : 'Unknown error');
      console.error(`[Queue] Failed to send to ${entry.phone}:`, errorMsg);
      failed.push({ phone: entry.phone, message: entry.message, error: errorMsg });
    }
  }

  console.log(`[Queue] Flush complete. Sent: ${sent.length}, Failed: ${failed.length}`);
  return { sent: sent.length, failed };
}

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
    currentQrCode = null;
    console.log('✅ [WhatsApp] Background client is ready! Messages will be sent silently.');

    // Auto-send any queued messages
    if (messageQueue.length > 0) {
      console.log(`[Queue] Found ${messageQueue.length} queued message(s). Auto-sending now...`);
      flushQueue().then(result => {
        if (result.sent > 0) {
          console.log(`✅ [Queue] Auto-sent ${result.sent} queued message(s) after login.`);
        }
        if (result.failed.length > 0) {
          console.warn(`⚠️ [Queue] ${result.failed.length} queued message(s) failed.`);
          result.failed.forEach(f => {
            console.warn(`  Failed: ${f.phone} - ${f.error}`);
          });
        }
      });
    } else {
      console.log('[Queue] No queued messages to send.');
    }
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
    queueLength: messageQueue.length,
    timestamp: new Date().toISOString()
  });
});

// WhatsApp status endpoint
app.get('/whatsapp/status', (req, res) => {
  res.json({
    status: waStatus,
    ready: waStatus === 'ready',
    error: waError,
    queueLength: messageQueue.length,
  });
});

// WhatsApp QR scan page — embedded in the bridge itself
app.get('/whatsapp/qr', async (req, res) => {
  if (waStatus === 'ready') {
    // If already ready, show connected page with auto-close
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp - Charlie AI</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#0f172a,#1e293b);min-height:100vh;display:flex;justify-content:center;align-items:center;color:#e2e8f0}
    .container{background:#1e293b;border-radius:24px;padding:40px;max-width:500px;width:90%;text-align:center;border:1px solid #334155;box-shadow:0 20px 60px rgba(0,0,0,0.5)}
    h1{font-size:24px;color:#38bdf8}
    .status{background:#d1fae5;color:#065f46;padding:12px 20px;border-radius:12px;font-weight:500}
  </style>
  <script>
    setTimeout(() => { window.close(); }, 1500);
  </script>
</head>
<body>
  <div class="container">
    <h1>✅ WhatsApp Connected</h1>
    <p class="status">Your WhatsApp is already authenticated! This tab will close automatically.</p>
  </div>
</body>
</html>`);
  }
  if (!currentQrCode) {
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp QR - Charlie AI</title>
  <meta http-equiv="refresh" content="2">
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#0f172a,#1e293b);min-height:100vh;display:flex;justify-content:center;align-items:center;color:#e2e8f0}
    .container{background:#1e293b;border-radius:24px;padding:40px;max-width:500px;width:90%;text-align:center;border:1px solid #334155}
  </style>
</head>
<body>
  <div class="container">
    <h1 style="color:#38bdf8">⏳ Generating QR Code...</h1>
    <p style="color:#94a3b8">Please wait, the QR code will appear shortly...</p>
  </div>
</body>
</html>`);
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
  <script>
    // Poll bridge for WhatsApp status; auto-close & redirect when ready
    let pollCount = 0;
    const pollInterval = setInterval(async () => {
      try {
        const resp = await fetch('/whatsapp/status');
        const data = await resp.json();
        pollCount++;
        document.getElementById('status-text').textContent = data.ready ? '✅ Connected! Auto-closing...' : '⏳ Waiting for scan...';
        document.getElementById('status-badge').className = data.ready ? 'status connected' : 'status waiting';
        if (data.ready) {
          clearInterval(pollInterval);
          document.getElementById('status-text').textContent = '✅ WhatsApp Connected! Message being sent...';
          // Close this tab after 1.5 seconds
          setTimeout(() => {
            window.close();
          }, 1500);
        }
      } catch(e) {
        document.getElementById('status-text').textContent = '⚠️ Connection error...';
      }
    }, 2000);
  </script>
</head>
<body>
  <div class="container">
    <h1>🔗 WhatsApp Authentication</h1>
    <p class="subtitle">Scan this QR code with WhatsApp on your phone</p>
    <div class="qr-container">${qrSvg}</div>
    <div id="status-badge" class="status waiting">
      <span id="status-text">⏳ Waiting for scan...</span>
    </div>
    <div class="steps">
      <strong>Steps:</strong>
      <ol>
        <li>Open <strong>WhatsApp</strong> on your phone</li>
        <li>Tap <strong>Menu</strong> (⋮) → <strong>Linked Devices</strong> → <strong>Link a Device</strong></li>
        <li>Scan the QR code above</li>
        <li>This page will auto-close once connected! ✅</li>
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

/**
 * Format phone number for whatsapp-web.js:
 * - Remove all non-digit characters (including +, spaces, dashes)
 * - Append @c.us suffix
 */
function formatPhoneForWA(phone) {
  const digits = phone.replace(/[^\d]/g, '');
  return digits + '@c.us';
}

// WhatsApp send message — SILENTLY in background
app.post('/whatsapp/send', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone) return res.status(400).json({ success: false, error: 'Phone number is required' });
  if (!message) return res.status(400).json({ success: false, error: 'Message is required' });

  if (waStatus !== 'ready') {
    return res.status(503).json({
      success: false,
      error: waStatus === 'qr_needed'
        ? 'WhatsApp not authenticated yet. Scan the QR code displayed in the dashboard to link your WhatsApp.'
        : `WhatsApp client is ${waStatus}. Please wait for it to be ready.`,
      waStatus,
    });
  }

  const chatId = formatPhoneForWA(phone);

  console.log(`[WhatsApp] Sending message to ${chatId} in background...`);

  try {
    const sent = await waClient.sendMessage(chatId, message);
    const messageId = sent && sent.id ? sent.id.id : 'unknown';
    console.log(`[WhatsApp] Message sent successfully to ${chatId} (ID: ${messageId})`);

    return res.json({
      success: true,
      message: `WhatsApp message sent to ${phone}`,
      messageId,
      background: true,
    });
  } catch (err) {
    console.error(`[WhatsApp] Send failed:`, err);
    return res.status(500).json({
      success: false,
      error: (err && err.message) || 'Failed to send WhatsApp message',
    });
  }
});

// ============================================================================
// WhatsApp Send-Or-Queue — tries to send; queues if not authenticated
// ============================================================================
app.post('/whatsapp/send-or-queue', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone) return res.status(400).json({ success: false, error: 'Phone number is required' });
  if (!message) return res.status(400).json({ success: false, error: 'Message is required' });

  // If ready, send immediately
  if (waStatus === 'ready') {
    const chatId = formatPhoneForWA(phone);

    try {
      const sent = await waClient.sendMessage(chatId, message);
      const messageId = sent && sent.id ? sent.id.id : 'unknown';
      console.log(`[WhatsApp] Message sent to ${chatId} (ID: ${messageId})`);
      return res.json({
        success: true,
        message: `WhatsApp message sent to ${phone}`,
        messageId,
        background: true,
        sent: true,
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: (err && err.message) || 'Failed to send' });
    }
  }

  // Not ready — queue the message
  addToQueue(phone, message);

  return res.json({
    success: true,
    queued: true,
    message: `Message queued for ${phone}. WhatsApp needs to be authenticated first.`,
    waStatus,
    queueLength: messageQueue.length,
  });
});

// ============================================================================
// Get current queue status
// ============================================================================
app.get('/whatsapp/queue', (req, res) => {
  res.json({
    queueLength: messageQueue.length,
    messages: messageQueue.map(e => ({ phone: e.phone, message: e.message, timestamp: e.timestamp })),
  });
});

// ============================================================================
// Check and send queued messages (called by frontend after polling detects ready)
// ============================================================================
app.post('/whatsapp/queue/flush', async (req, res) => {
  if (waStatus !== 'ready') {
    return res.json({ flushed: false, sent: 0, failed: [], waStatus, message: 'Client not ready yet' });
  }

  const result = await flushQueue();
  return res.json({
    flushed: result.sent > 0 || result.failed.length > 0,
    sent: result.sent,
    failed: result.failed,
    waStatus,
  });
});

// Main execute endpoint (existing functionality)
app.post('/execute', (req, res) => {
  const { command, target, subject, body, to, phone, message } = req.body;
  console.log(`[Bridge Execution Request]: command=${command}, target=${target}`);

  // Route WhatsApp commands to the background client
  if (command === 'send_whatsapp') {
    return app._handleWhatsAppSend(req, res);
  }

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

  const chatId = formatPhoneForWA(phone);

  console.log(`[WhatsApp] Sending message to ${chatId} in background...`);

  try {
    const sent = await waClient.sendMessage(chatId, message || '');
    const messageId = sent && sent.id ? sent.id.id : 'unknown';
    console.log(`[WhatsApp] Message sent successfully (ID: ${messageId})`);

    return res.json({
      success: true,
      message: `WhatsApp message sent to ${phone}`,
      messageId,
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

// ============================================================================
// Start server
// ============================================================================
async function start() {
  // Try to load queued messages from Google Sheets backup (if any)
  await loadQueueFromSheets();

  // Initialize WhatsApp client
  initWhatsAppClient();

  app.listen(PORT, () => {
    console.log('============================================');
    console.log(`  🤖 Charlie AI Desktop Bridge`);
    console.log(`  Running on http://localhost:${PORT}`);
    console.log(`  WhatsApp: ${waStatus === 'ready' ? '✅ Ready' : '⏳ Initializing...'}`);
    if (messageQueue.length > 0) {
      console.log(`  Queue: ${messageQueue.length} pending message(s)`);
    }
    console.log('============================================');
  });
}

start();
