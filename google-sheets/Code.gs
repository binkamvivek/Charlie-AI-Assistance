/**
 * Charlie AI Assistant - Zero-Cost Google Sheets Memory Database Engine
 * Deploy this script as a Web App (Execute as: Me, Access: Anyone)
 */

function doGet(e) {
  const action = e.parameter.action || 'get_facts';
  return handleAction(action, e.parameter);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || 'save_fact';
    return handleAction(action, data);
  } catch (error) {
    return createJsonResponse({ status: 'error', message: error.toString() });
  }
}

function handleAction(action, params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  initSheets(ss);

  if (action === 'get_facts') {
    const facts = {
      Identity_Facts: getSheetData(ss.getSheetByName('Identity_Facts')),
      Interests_Log: getSheetData(ss.getSheetByName('Interests_Log')),
      Task_Routines: getSheetData(ss.getSheetByName('Task_Routines'))
    };
    return createJsonResponse({ status: 'success', data: facts });
  }

  if (action === 'save_fact' || action === 'update_fact') {
    const category = params.category || 'Identity_Facts';
    const key = params.key;
    const value = params.value;
    const details = params.details || '';
    const sheet = ss.getSheetByName(category) || ss.getSheetByName('Identity_Facts');

    const updated = upsertFact(sheet, key, value, details);
    return createJsonResponse({ status: 'success', action: updated ? 'updated' : 'inserted', key: key, value: value });
  }

  if (action === 'delete_fact') {
    const category = params.category || 'Identity_Facts';
    const key = params.key;
    const sheet = ss.getSheetByName(category);
    if (sheet) {
      deleteFact(sheet, key);
    }
    return createJsonResponse({ status: 'success', action: 'deleted', key: key });
  }

  if (action === 'log_activity') {
    const sheet = ss.getSheetByName('Interests_Log');
    const topic = params.topic || params.keyword || '';
    const source = params.source || 'Chrome Extension';
    if (topic) {
      sheet.appendRow([new Date().toISOString(), topic, source, params.url || '']);
    }
    return createJsonResponse({ status: 'success', action: 'logged' });
  }

  // ===========================================================================
  // CONTACTS MANAGEMENT
  // ===========================================================================
  if (action === 'save_contact') {
    const sheet = ss.getSheetByName('Contacts');
    const nickname = (params.nickname || '').trim();
    const phone = (params.phone || '').trim();
    if (!nickname || !phone) {
      return createJsonResponse({ status: 'error', message: 'Nickname and phone are required' });
    }
    const values = sheet.getDataRange().getValues();
    let foundRow = -1;
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] && values[i][0].toString().toLowerCase() === nickname.toLowerCase()) {
        foundRow = i + 1;
        break;
      }
    }
    if (foundRow > 0) {
      sheet.getRange(foundRow, 2).setValue(phone);
      sheet.getRange(foundRow, 3).setValue(new Date().toISOString());
    } else {
      sheet.appendRow([nickname, phone, new Date().toISOString()]);
    }
    return createJsonResponse({ status: 'success', action: 'saved', nickname, phone });
  }

  if (action === 'find_contact') {
    const sheet = ss.getSheetByName('Contacts');
    const searchName = (params.nickname || '').trim().toLowerCase();
    if (!searchName) {
      return createJsonResponse({ status: 'success', found: false });
    }
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      const name = (values[i][0] || '').toString().toLowerCase();
      const phone = (values[i][1] || '').toString();
      // Exact match
      if (name === searchName) {
        return createJsonResponse({ status: 'success', found: true, nickname: values[i][0], phone });
      }
      // Partial match
      if (name.includes(searchName) || searchName.includes(name)) {
        return createJsonResponse({ status: 'success', found: true, nickname: values[i][0], phone });
      }
    }
    return createJsonResponse({ status: 'success', found: false });
  }

  if (action === 'get_contacts') {
    const sheet = ss.getSheetByName('Contacts');
    const data = getSheetData(sheet);
    return createJsonResponse({ status: 'success', data });
  }

  if (action === 'delete_contact') {
    const sheet = ss.getSheetByName('Contacts');
    const nickname = (params.nickname || '').trim();
    if (nickname) {
      deleteFact(sheet, nickname);
    }
    return createJsonResponse({ status: 'success', action: 'deleted', nickname });
  }

  // ===========================================================================
  // WHATSAPP QUEUE MANAGEMENT
  // ===========================================================================
  if (action === 'queue_message') {
    const sheet = ss.getSheetByName('WhatsApp_Queue');
    const phone = (params.phone || '').trim();
    const message = (params.message || '').trim();
    if (phone && message) {
      sheet.appendRow([new Date().toISOString(), phone, message, 'pending']);
    }
    return createJsonResponse({ status: 'success', action: 'queued', phone, message_length: message.length });
  }

  if (action === 'get_queued_messages') {
    const sheet = ss.getSheetByName('WhatsApp_Queue');
    const data = getSheetData(sheet);
    if (data && data.length > 0) {
      // Filter only pending messages
      const pending = data.filter(row => (row.Status || '').toLowerCase() === 'pending');
      return createJsonResponse({ status: 'success', data: pending });
    }
    return createJsonResponse({ status: 'success', data: [] });
  }

  if (action === 'clear_queued_message') {
    const sheet = ss.getSheetByName('WhatsApp_Queue');
    const phone = (params.phone || '').trim();
    const message = (params.message || '').trim();
    if (sheet && phone) {
      const values = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        const rowPhone = (values[i][1] || '').toString();
        const rowMsg = (values[i][2] || '').toString();
        if (rowPhone === phone && (message ? rowMsg === message : true)) {
          sheet.getRange(i + 1, 4).setValue('sent');
        }
      }
    }
    return createJsonResponse({ status: 'success', action: 'cleared' });
  }

  if (action === 'clear_all_queued') {
    const sheet = ss.getSheetByName('WhatsApp_Queue');
    if (sheet) {
      const values = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        sheet.getRange(i + 1, 4).setValue('sent');
      }
    }
    return createJsonResponse({ status: 'success', action: 'all_cleared' });
  }

  // ===========================================================================
  // AWAY MODE
  // ===========================================================================
  if (action === 'get_away_state') {
    const sheet = ss.getSheetByName('AwayMode');
    const data = getSheetData(sheet);
    const activeRow = data.find(r => r.Key === 'away_active');
    return createJsonResponse({
      status: 'success',
      data: activeRow || { Key: 'away_active', Value: 'false', Details: '{}', Updated_At: '' }
    });
  }

  if (action === 'log_away_conversation') {
    const sheet = ss.getSheetByName('Away_Log');
    const phone = (params.phone || params.incoming_phone || '').trim();
    const incoming = (params.incoming_message || '').trim();
    const reply = (params.reply_message || '').trim();
    const sessionId = (params.session_id || '').trim();
    const step = (params.step || '').trim();
    const state = (params.state || '').trim();
    if (phone) {
      sheet.appendRow([new Date().toISOString(), sessionId, step, phone, incoming, reply, state]);
    }
    return createJsonResponse({ status: 'success', action: 'logged' });
  }

  // ===========================================================================
  // AWAY CONVERSATIONS — structured per-session records
  // ===========================================================================
  if (action === 'save_away_conversation') {
    const sheet = ss.getSheetByName('Away_Conversations');
    const sessionId = (params.session_id || '').trim();
    const phone = (params.phone || '').trim();
    const chatId = (params.chat_id || '').trim();
    const status = (params.status || 'in_progress').trim();
    const collectedData = params.collected_data || '{}';

    if (!sessionId || !phone) {
      return createJsonResponse({ status: 'error', message: 'session_id and phone are required' });
    }

    const now = new Date().toISOString();
    const values = sheet.getDataRange().getValues();
    let foundRow = -1;
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] && values[i][0].toString() === sessionId) {
        foundRow = i + 1;
        break;
      }
    }

    if (foundRow > 0) {
      sheet.getRange(foundRow, 4).setValue(now);
      sheet.getRange(foundRow, 5).setValue(status);
      sheet.getRange(foundRow, 6).setValue(collectedData);
      sheet.getRange(foundRow, 7).setValue(now);
    } else {
      sheet.appendRow([sessionId, phone, chatId, now, '', status, collectedData, now]);
    }

    return createJsonResponse({ status: 'success', action: 'saved', session_id: sessionId });
  }

  if (action === 'update_away_conversation') {
    const sheet = ss.getSheetByName('Away_Conversations');
    const sessionId = (params.session_id || '').trim();
    if (!sessionId) {
      return createJsonResponse({ status: 'error', message: 'session_id is required' });
    }

    const now = new Date().toISOString();
    const values = sheet.getDataRange().getValues();
    let foundRow = -1;
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] && values[i][0].toString() === sessionId) {
        foundRow = i + 1;
        break;
      }
    }
    if (foundRow === -1) {
      return createJsonResponse({ status: 'error', message: 'Session not found' });
    }

    if (params.status) {
      sheet.getRange(foundRow, 5).setValue(params.status);
      if (params.status === 'complete' || params.status === 'timed_out') {
        sheet.getRange(foundRow, 4).setValue(now);
      }
    }
    if (params.collected_data) {
      sheet.getRange(foundRow, 6).setValue(params.collected_data);
    }
    sheet.getRange(foundRow, 7).setValue(now);

    return createJsonResponse({ status: 'success', action: 'updated', session_id: sessionId });
  }

  if (action === 'get_away_conversations') {
    const sheet = ss.getSheetByName('Away_Conversations');
    const data = getSheetData(sheet);
    const phone = (params.phone || '').trim().toLowerCase();
    const filterStatus = (params.status || '').trim().toLowerCase();

    let filtered = data;
    if (phone) {
      filtered = filtered.filter(r => (r.Phone || '').toString().toLowerCase() === phone);
    }
    if (filterStatus) {
      filtered = filtered.filter(r => (r.Status || '').toString().toLowerCase() === filterStatus);
    }
    // Sort by started_at descending (newest first)
    filtered.sort((a, b) => {
      const da = new Date(a.Started_At || 0);
      const db = new Date(b.Started_At || 0);
      return db - da;
    });

    return createJsonResponse({ status: 'success', data: filtered });
  }

  return createJsonResponse({ status: 'error', message: 'Unknown action: ' + action });
}

function initSheets(ss) {
  const tabs = [
    { name: 'Identity_Facts', headers: ['Key', 'Value', 'Details', 'Updated_At'] },
    { name: 'Interests_Log', headers: ['Timestamp', 'Topic', 'Source', 'URL'] },
    { name: 'Task_Routines', headers: ['Key', 'Value', 'Details', 'Updated_At'] },
    { name: 'Contacts', headers: ['Nickname', 'Phone', 'Created_At'] },
    { name: 'WhatsApp_Queue', headers: ['Timestamp', 'Phone', 'Message', 'Status'] },
    { name: 'AwayMode', headers: ['Key', 'Value', 'Details', 'Updated_At'] },
    { name: 'Away_Log', headers: ['Timestamp', 'Session_ID', 'Step', 'Phone', 'Incoming', 'Reply', 'State'] },
    { name: 'Away_Conversations', headers: ['Session_ID', 'Phone', 'Chat_ID', 'Started_At', 'Completed_At', 'Status', 'Collected_Data', 'Updated_At'] }
  ];

  tabs.forEach(tab => {
    let sheet = ss.getSheetByName(tab.name);
    if (!sheet) {
      sheet = ss.insertSheet(tab.name);
      sheet.appendRow(tab.headers);
      sheet.getRange(1, 1, 1, tab.headers.length).setFontWeight('bold');
    }
  });
}

function getSheetData(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const rowObj = {};
    headers.forEach((h, colIndex) => {
      rowObj[h] = values[i][colIndex];
    });
    rows.push(rowObj);
  }
  return rows;
}

function upsertFact(sheet, key, value, details) {
  const values = sheet.getDataRange().getValues();
  const now = new Date().toISOString();
  let foundRow = -1;

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] && values[i][0].toString().toLowerCase() === key.toString().toLowerCase()) {
      foundRow = i + 1; // 1-indexed
      break;
    }
  }

  if (foundRow > 0) {
    sheet.getRange(foundRow, 2).setValue(value);
    sheet.getRange(foundRow, 3).setValue(details);
    sheet.getRange(foundRow, 4).setValue(now);
    return true;
  } else {
    sheet.appendRow([key, value, details, now]);
    return false;
  }
}

function deleteFact(sheet, key) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] && values[i][0].toString().toLowerCase() === key.toString().toLowerCase()) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
