import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import os from 'os';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// System app mapping for Windows / OS
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
    // Use PowerShell with Base64-encoded command to avoid all quoting issues
    // Get-StartApps returns full AUMID (e.g. 5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App)
    // Use explorer.exe shell:AppsFolder\AUMID to launch
    const script = `$app = Get-StartApps | Where-Object { $_.Name -like '*${safeName}*' } | Select-Object -First 1; if ($app) { explorer.exe ('shell:AppsFolder\\' + $app.AppId) } else { Start-Process -FilePath '${safeName}' -ErrorAction SilentlyContinue; if (-not $?) { Write-Error 'App not found: ${safeName}' } }`;
    const bytes = Buffer.from(script, 'utf16le').toString('base64');
    return `powershell -NoProfile -EncodedCommand ${bytes}`;
  }

  return `open -a "${appName}"`;
}

app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    system: os.type(),
    platform: process.platform,
    hostname: os.hostname(),
    timestamp: new Date().toISOString()
  });
});

app.post('/execute', (req, res) => {
  const { command, target, subject, body, to } = req.body;
  console.log(`[Bridge Execution Request]: command=${command}, target=${target}`);

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

  // WhatsApp Send Message — uses wa.me URI then auto-presses Enter to send
  if (command === 'send_whatsapp') {
    const { phone, message } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    // Strip any non-digit characters from phone (keep +)
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    const encodedMsg = encodeURIComponent(message || '');
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodedMsg}`;

    console.log(`[Bridge] Sending WhatsApp to ${cleanPhone}: ${message}`);

    if (process.platform === 'win32') {
      // Use PowerShell to:
      // 1. Open wa.me URL (pre-fills the message)
      // 2. Wait 5 seconds for WhatsApp Web/Desktop to load
      // 3. Bring the WhatsApp/chrome window to foreground
      // 4. Simulate pressing Enter to auto-send
      const psScript = `
Start-Process "${waUrl}"
Start-Sleep -Seconds 5
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
      `.trim();

      const bytes = Buffer.from(psScript, 'utf16le').toString('base64');
      const cmd = `powershell -NoProfile -EncodedCommand ${bytes}`;

      exec(cmd, { timeout: 20000 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[Bridge] WhatsApp send failed: ${error.message}`);
          return res.status(500).json({ success: false, error: error.message });
        }
        console.log(`[Bridge] WhatsApp message sent to ${cleanPhone}`);
        return res.json({ success: true, message: `WhatsApp message sent to ${cleanPhone}` });
      });
    } else {
      // macOS/Linux — just open the URL (cannot auto-send easily)
      exec(`open "${waUrl}"`, (error) => {
        if (error) {
          return res.status(500).json({ success: false, error: error.message });
        }
        return res.json({ success: true, message: `WhatsApp opened for ${cleanPhone} (press Enter to send)` });
      });
    }
    return;
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

app.listen(PORT, () => {
  console.log(` Charlie AI Desktop Bridge running on http://localhost:${PORT}`);
});
