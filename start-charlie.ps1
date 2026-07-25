# Charlie AI — One-click launcher
# Starts the WhatsApp bridge + dev server together

$BridgeJob = Start-Job -ScriptBlock {
    Set-Location -LiteralPath "$using:PWD"
    node desktop-bridge/server.js
}

Write-Host "🤖 Charlie AI Bridge started in background"
Write-Host "🚀 Starting dashboard..."
npm run dev

# Cleanup: stop bridge when dev server exits
Stop-Job $BridgeJob -ErrorAction SilentlyContinue
Remove-Job $BridgeJob -ErrorAction SilentlyContinue
