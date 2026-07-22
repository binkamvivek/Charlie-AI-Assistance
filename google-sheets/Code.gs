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

  return createJsonResponse({ status: 'error', message: 'Unknown action: ' + action });
}

function initSheets(ss) {
  const tabs = [
    { name: 'Identity_Facts', headers: ['Key', 'Value', 'Details', 'Updated_At'] },
    { name: 'Interests_Log', headers: ['Timestamp', 'Topic', 'Source', 'URL'] },
    { name: 'Task_Routines', headers: ['Key', 'Value', 'Details', 'Updated_At'] }
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
