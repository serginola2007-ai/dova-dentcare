@echo off
setlocal

set "PATH=C:\Program Files\nodejs;%PATH%"
set BASE=%~dp0
set BACKEND=%BASE%backend
set FRONTEND=%BASE%frontend

echo Iniciando backend DOVA (puerto 4000)...
start "DOVA Backend" cmd /k "set PATH=C:\Program Files\nodejs;%PATH% && cd /d "%BACKEND%" && node src\server.js"

timeout /t 3 /nobreak >nul

echo Iniciando frontend DOVA (puerto 8080)...
start "DOVA Frontend" cmd /k "set PATH=C:\Program Files\nodejs;%PATH% && cd /d "%FRONTEND%" && npx --yes serve -l 8080 ."

timeout /t 5 /nobreak >nul

echo.
echo Listo. Abriendo el navegador...
start http://localhost:8080/moderno/index.html

echo.
echo DOVA esta corriendo. No cierres las ventanas "DOVA Backend" y "DOVA Frontend".
echo Usuario: admin / Contrasena: admin
echo.
pause
