@echo off
setlocal
REM DOVA local: un solo servidor (API + pantallas) en http://localhost:4000
REM Requisitos: Node.js 22, PostgreSQL y backend\.env creado desde backend\.env.example
set BASE=%~dp0
cd /d "%BASE%backend"

if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)
echo Actualizando la base de datos...
call npm run migrate:up
call npm run seed

echo Iniciando DOVA en http://localhost:4000 ...
start "DOVA" cmd /k "cd /d "%BASE%backend" && npm run dev"
timeout /t 4 /nobreak >nul
start http://localhost:4000/moderno/

echo.
echo DOVA esta corriendo. No cierres la ventana "DOVA".
echo Usuario inicial en desarrollo: admin / admin (pide cambiar la contrasena).
echo.
pause
