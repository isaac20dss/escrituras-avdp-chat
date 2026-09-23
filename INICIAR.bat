@echo off
title Escrituras AVDP + Chat ao Vivo
echo ===================================================
echo     Iniciando Escrituras AVDP + Chat ao Vivo
echo ===================================================
echo.

cd /d "%~dp0"

if not exist node_modules (
    echo Primeira vez executando no Windows! Instalando dependencias...
    call npm install
    echo.
)

echo Iniciando o aplicativo e abrindo o Painel de Controle no navegador...
timeout /t 2 /nobreak >nul
start http://localhost:3000/#/control

call npm start
pause
