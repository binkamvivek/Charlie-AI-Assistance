Write-Host "=== Testing Desktop Bridge ===" -ForegroundColor Cyan

try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3001/health' -UseBasicParsing
    Write-Host "Health:" -ForegroundColor Green
    Write-Host $r.Content
} catch {
    Write-Host "Bridge not running: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Testing WhatsApp Status ===" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3001/whatsapp/status' -UseBasicParsing
    $status = $r.Content | ConvertFrom-Json
    Write-Host "Status: $($status.status)" -ForegroundColor Yellow
    Write-Host "Ready: $($status.ready)" -ForegroundColor Yellow
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Testing Send-Or-Queue ===" -ForegroundColor Cyan
try {
    $body = @{phone="+1234567890"; message="Hello from Charlie AI debug test"} | ConvertTo-Json
    $r = Invoke-WebRequest -Uri 'http://localhost:3001/whatsapp/send-or-queue' -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing
    $result = $r.Content | ConvertFrom-Json
    Write-Host "Response:" -ForegroundColor Green
    Write-Host $r.Content
    if ($result.queued -eq $true) {
        Write-Host "`n✅ Message queued successfully!" -ForegroundColor Green
    }
    if ($result.sent -eq $true) {
        Write-Host "`n✅ Message sent successfully!" -ForegroundColor Green
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Testing Queue Status ===" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3001/whatsapp/queue' -UseBasicParsing
    Write-Host "Queue: $($r.Content)" -ForegroundColor Green
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Testing QR Page ===" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3001/whatsapp/qr' -UseBasicParsing
    if ($r.Content -match 'WhatsApp') {
        Write-Host "✅ QR page loads correctly" -ForegroundColor Green
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== All Debug Tests Complete ===" -ForegroundColor Cyan
