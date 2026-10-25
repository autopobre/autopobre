@echo off
rem Wrangler com o Node portatil de Projetos_iA\apps, sem precisar mexer no PATH.
rem Uso (cmd ou PowerShell, dentro desta pasta): .\wrangler login / .\wrangler deploy / .\wrangler secret put CHAVE_GRUPO
setlocal
set "NODEDIR=%~dp0..\..\apps\node-v22.23.2-win-x64"
if exist "%NODEDIR%\node.exe" (
  set "PATH=%NODEDIR%;%PATH%"
  "%NODEDIR%\node.exe" "%~dp0node_modules\wrangler\bin\wrangler.js" %*
) else (
  node "%~dp0node_modules\wrangler\bin\wrangler.js" %*
)
