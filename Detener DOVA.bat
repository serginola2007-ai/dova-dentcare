@echo off
echo Deteniendo DOVA...
taskkill /FI "WINDOWTITLE eq DOVA*" /T /F >nul 2>&1
echo Listo. DOVA detenido.
pause
