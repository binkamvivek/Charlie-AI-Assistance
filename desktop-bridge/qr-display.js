/**
 * QR Display Helper — Opens the bridge's built-in QR page in your browser.
 * The QR page is served at http://localhost:3001/qr by the bridge itself.
 * No separate Puppeteer/WhatsApp instance needed.
 */
import { exec } from 'child_process';
import http from 'http';

const BRIDGE_URL = 'http://localhost:3001';
const QR_URL = `${BRIDGE_URL}/qr`;

console.log('==============================================');
console.log('  WhatsApp QR Code Helper');
console.log('==============================================');
console.log('');

// Check if bridge is running
function checkBridge() {
  return new Promise((resolve) => {
    const req = http.get(`${BRIDGE_URL}/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          resolve(info);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(2000, () => { req.destroy(); resolve(null); });
  });
}

async function main() {
  console.log('Checking if Desktop Bridge is running...');

  const bridgeInfo = await checkBridge();
  if (!bridgeInfo) {
    console.log('❌ Desktop Bridge is not running!');
    console.log('');
    console.log('Please start the bridge first in another terminal:');
    console.log('  npm run bridge');
    console.log('');
    console.log('Then run this command again:');
    console.log('  npm run bridge:qr');
    process.exit(1);
  }

  console.log(`✅ Desktop Bridge is running (WhatsApp status: ${bridgeInfo.waStatus || 'unknown'})`);
  console.log('');

  if (bridgeInfo.waStatus === 'ready') {
    console.log('✅ WhatsApp is already authenticated!');
    console.log('Messages will be sent silently in the background.');
    console.log('');
    console.log('You can view status at:');
    console.log(`  ${BRIDGE_URL}/health`);
    process.exit(0);
  }

  console.log('⏳ WhatsApp needs authentication.');
  console.log('Opening QR code page in your browser...');
  console.log(`  ${QR_URL}`);
  console.log('');

  // Open the URL in the default browser
  const cmd = process.platform === 'win32'
    ? `start "" "${QR_URL}"`
    : process.platform === 'darwin'
      ? `open "${QR_URL}"`
      : `xdg-open "${QR_URL}"`;

  exec(cmd, (err) => {
    if (err) {
      console.log(`Could not open browser automatically.`);
      console.log(`Please open this URL manually:`);
      console.log(`  ${QR_URL}`);
    } else {
      console.log('✅ Browser opened. Scan the QR code with your phone.');
      console.log('');
      console.log('Steps:');
      console.log('  1. Open WhatsApp on your phone');
      console.log('  2. Tap Menu (⋮) → Linked Devices → Link a Device');
      console.log('  3. Scan the QR code shown in your browser');
      console.log('');
      console.log('Once connected, refresh the page to see ✅ status.');
    }
  });
}

main();

