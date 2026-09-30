@echo off
echo Deteniendo DOVA...
taskkill /FI "WINDOWTITLE eq DOVA Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq DOVA Frontend*" /T /F >nul 2>&1
echo Listo. DOVA detenido.
pause
