@echo off
echo === Testing Desktop Bridge ===
echo.
echo Checking Health...
powershell -Command "$r = Invoke-WebRequest -Uri 'http://localhost:3001/health' -UseBasicParsing; Write-Host $r.Content"
if %errorlevel% neq 0 echo Bridge not running!
echo.
echo Checking WhatsApp Status...
powershell -Command "$r = Invoke-WebRequest -Uri 'http://localhost:3001/whatsapp/status' -UseBasicParsing; Write-Host $r.Content"
echo.
echo Testing Send-Or-Queue...
powershell -Command "$body = @{phone='+1234567890'; message='Hello from Charlie AI debug test'} | ConvertTo-Json; $r = Invoke-WebRequest -Uri 'http://localhost:3001/whatsapp/send-or-queue' -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing; Write-Host $r.Content"
echo.
echo === All Debug Tests Complete ===
pause
