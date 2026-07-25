// Test script for Charlie Desktop Bridge
const BASE = 'http://localhost:3001';

async function test() {
    console.log('=== Testing Desktop Bridge ===\n');

    // 1. Health check
    try {
        const r = await fetch(`${BASE}/health`);
        const data = await r.json();
        console.log('✅ Health:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('❌ Bridge not running:', e.message);
        process.exit(1);
    }

    // 2. WhatsApp status
    try {
        const r = await fetch(`${BASE}/whatsapp/status`);
        const data = await r.json();
        console.log('\n✅ WhatsApp Status:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('❌ Status error:', e.message);
    }

    // 3. Test send-or-queue (will queue since not authenticated)
    try {
        const r = await fetch(`${BASE}/whatsapp/send-or-queue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: '+1234567890', message: 'Debug test message' })
        });
        const data = await r.json();
        console.log('\n✅ Send-Or-Queue Response:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('❌ Send-Or-Queue error:', e.message);
    }

    // 4. Check queue
    try {
        const r = await fetch(`${BASE}/whatsapp/queue`);
        const data = await r.json();
        console.log('\n✅ Queue Status:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('❌ Queue error:', e.message);
    }

    console.log('\n=== All Tests Complete ===');
}

test();
