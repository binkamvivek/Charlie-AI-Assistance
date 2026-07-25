# WhatsApp Queue & Auto-Send After QR Login

## Overview
When user says "send this message to [number]", if WhatsApp is not logged in:
1. Queue the message (in bridge memory + Google Sheets backup)
2. Open QR code tab automatically
3. Poll for WhatsApp login completion
4. Auto-send queued message after login success
5. Close QR tab and redirect to dashboard
6. Never ask again unless logged out

## Steps

### Step 1: Google Sheets - Add WhatsApp_Queue Sheet ✅
- [x] Add `WhatsApp_Queue` sheet with columns: [Timestamp, Phone, Message, Status, Queued_At]
- [x] Add handler actions: `queue_message`, `get_queued_messages`, `clear_queued_message`, `clear_all_queued`, `mark_message_sent`
- [x] Add helper functions: `clearQueuedMessage`, `clearAllQueued`, `markMessageSent`

### Step 2: Desktop Bridge - Queue + Auto-Send ✅
- [x] Add in-memory queue (array of {phone, message, timestamp})
- [x] Add backup/remove from Google Sheets helpers
- [x] Add POST `/whatsapp/send-or-queue` endpoint that queues if not ready
- [x] Add GET `/whatsapp/queue` endpoint to fetch pending queued messages
- [x] Add POST `/whatsapp/queue/flush` endpoint to send queued messages
- [x] Modify `ready` event handler to auto-send all queued messages via `flushQueue()`
- [x] Update QR page (`/whatsapp/qr`) with auto-polling every 2s and auto-close when connected

### Step 3: BridgeService - New Methods ✅
- [x] Add `sendWhatsAppOrQueue(phone, message)` - calls `/whatsapp/send-or-queue` endpoint
- [x] Add `flushWhatsAppQueue()` - calls `/whatsapp/queue/flush`
- [x] Add `pollWhatsAppUntilReady(maxAttempts, intervalMs, onReady, onPoll)` - polls status, calls callback when ready

### Step 4: BrainEngine - Updated WhatsApp Flow ✅
- [x] Update SYSTEM_ACTION WhatsApp handler to use new queue flow
- [x] On "send message" when not logged in: queue → open QR tab → poll → auto-send
- [x] Return proper response texts for each stage (queued vs sent vs fallback wa.me)

### Step 5: Deployment & Testing ✅
- [x] Redeployed Google Sheets Apps Script with the new Code.gs
- [x] Desktop Bridge is running at `http://localhost:3001`
- [x] WhatsApp client is authenticated (session restored)
- [x] Tested `/whatsapp/status` endpoint — returns `ready: true`
- [ ] Test on https://charlieai-azure.vercel.app/ — open the dashboard, say "send hello to +1234567890"

