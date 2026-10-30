$env:DEBUG="*"
$env:LOG_LEVEL="debug"
$env:OPENAI_API_KEY="freellmapi-98477c1dd89442768449a2a9dcecdf07232519610c365d3d"
$env:OPENAI_BASE_URL="http://127.0.0.1:31415/v1"
$env:TT_MCP_ENABLED="1"
node server.js 2>&1 | Tee-Object -FilePath "C:\Users\User\Downloads\TT_BUDDY_3.0_Windows\TT_BUDDY-win32-x64\tt_debug.log" -Append
