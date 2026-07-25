@echo off
title Charlie AI Bridge
echo Starting WhatsApp Bridge...
start /MIN cmd /c "node desktop-bridge\server.js && pause"
echo.
echo ✅ Bridge started at http://localhost:3001
echo You can minimize this window — the bridge runs in the background.
echo Open the Vercel dashboard and say "check bridge" to verify.
echo.
pause
