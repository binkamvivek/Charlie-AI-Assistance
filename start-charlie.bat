@echo off
title Charlie AI Assistant
echo Starting Charlie AI Bridge...
start /B /MIN node desktop-bridge\server.js
timeout /T 2 /NOBREAK >nul
echo Starting Dashboard...
npm run dev
