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
  chrome: process.platform === 'win32' ? 'start chrome' : 'open -a "Google Chrome"'
};

function getLaunchCommand(appName) {
  const known = APP_COMMANDS[appName.toLowerCase()];
  if (known) return known;

  if (process.platform === 'win32') {
    const safeName = appName.replace(/'/g, "''");
    // Strategy: use PowerShell Get-StartApps to find the app by name,
    // then launch via explorer shell:AppsFolder (works for all UWP/Store apps)
    return `powershell -NoProfile -Command "$app = Get-StartApps | Where-Object { $_.Name -like '*${safeName}*' } | Select-Object -First 1; if ($app) { Start-Process $app.AppId } else { Start-Process '${safeName}' -ErrorAction SilentlyContinue; if (-not $?) { throw 'Could not find or launch: ${safeName}' } }"`;
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
