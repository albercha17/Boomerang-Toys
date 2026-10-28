@echo off
rem Doble clic para arrancar el juego. Cierra esta ventana para pararlo.
chcp 65001 >nul
title Bumeran de Juguete - servidor
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo No se encuentra Node.js. Instalalo desde https://nodejs.org y vuelve a intentarlo.
  goto :fin
)

rem Instala o actualiza las dependencias (tarda unos segundos si ya estan al dia).
echo Comprobando dependencias...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 goto :fin

rem Abre la pantalla del juego cuando el servidor ya esta escuchando. Con Chrome, en una ventana propia del juego
rem que usa la tarjeta grafica potente (en portatiles con dos, Chrome coge la lenta y el juego va a tirones).
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" goto :sin_chrome
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" "%CHROME%" --force_high_performance_gpu --user-data-dir="%LocalAppData%\BumeranJuguete\chrome" --no-first-run --start-maximized --app=http://localhost:3000/"
goto :servidor
:sin_chrome
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:3000/"
:servidor

echo Deja esta ventana abierta mientras jugais.
node server.js --port 3000

:fin
echo.
echo El servidor se ha detenido. Revisa el mensaje de arriba.
pause
