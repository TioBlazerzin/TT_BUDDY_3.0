@echo off
echo Limpando processos antigos...
taskkill /F /IM "TT BUDDY 3.0.exe" 2>nul
taskkill /F /IM "TT BUDDY*" 2>nul
timeout /t 2
echo Iniciando FreeLLMAPI...
start "" "C:\Users\User\AppData\Local\FreeLLMAPI\FreeLLMAPI.exe"
timeout /t 3
echo Iniciando TT Buddy com MCP direto...
cd /d "C:\Users\User\Downloads\TT_BUDDY_3.0_Windows\TT_BUDDY-win32-x64\resources\app\server\..\.."
start "" "TT BUDDY 3.0.exe"
echo TT Buddy iniciado com MCP direto 100%!
pause
