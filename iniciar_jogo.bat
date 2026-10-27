@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Cinzas de Morvath - servidor
rem ==========================================================================
rem  Cinzas de Morvath: instala o que falta e sobe o jogo na porta 8020,
rem  disponivel para quem estiver na mesma rede.
rem  Pode rodar sempre: o que ja estiver instalado e pulado.
rem ==========================================================================
set "PORTA=8020"
set "REGRA=CinzasDeMorvath%PORTA%"
cd /d "%~dp0"

echo.
echo  ===============================================
echo    CINZAS DE MORVATH - instalação e servidor
echo  ===============================================
echo.

rem ---------- 1. Python 3.10 ou mais novo ----------
set "PY="
where py >nul 2>&1 && py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1 && set "PY=py -3"
if not defined PY (
    where python >nul 2>&1 && python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1 && set "PY=python"
)
if not defined PY (
    echo  [x] Python 3.10 ou mais novo não foi encontrado.
    where winget >nul 2>&1
    if errorlevel 1 (
        echo      Instale pelo site https://www.python.org/downloads/
        echo      marcando "Add python.exe to PATH" e rode este arquivo de novo.
        pause
        exit /b 1
    )
    choice /c SN /m "  Instalar o Python 3.12 agora pelo winget"
    if errorlevel 2 exit /b 1
    winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
    echo.
    echo  Python instalado. FECHE esta janela e rode o iniciar_jogo.bat de novo.
    pause
    exit /b 0
)
echo  [ok] Python encontrado: %PY%

rem ---------- 2. Ambiente virtual e bibliotecas ----------
if not exist ".venv\Scripts\python.exe" (
    echo  [..] Criando o ambiente virtual .venv
    %PY% -m venv .venv
    if errorlevel 1 ( echo  [x] Falha ao criar o .venv & pause & exit /b 1 )
)
set "VPY=.venv\Scripts\python.exe"
"%VPY%" -c "import fastapi, uvicorn, ollama, dotenv, mcp, bcrypt" >nul 2>&1
if errorlevel 1 (
    echo  [..] Instalando as bibliotecas do requirements.txt
    "%VPY%" -m pip install --upgrade pip --disable-pip-version-check -q
    "%VPY%" -m pip install -r requirements.txt --disable-pip-version-check
    if errorlevel 1 ( echo  [x] Falha ao instalar as bibliotecas. Verifique a internet. & pause & exit /b 1 )
)
echo  [ok] Bibliotecas instaladas

rem ---------- 3. Configuracao da IA (.env) ----------
if not exist ".env" (
    copy /y ".env.example" ".env" >nul
    echo  [ok] Criado o arquivo .env a partir do .env.example
)
set "MODELO=qwen3:8b"
for /f "usebackq tokens=1,* delims==" %%a in (".env") do if /i "%%a"=="OLLAMA_MODEL" set "MODELO=%%b"
findstr /b /i "OLLAMA_HOST=https" ".env" >nul 2>&1
if not errorlevel 1 (
    echo  [ok] IA: Ollama Cloud, modelo !MODELO!
) else (
    where ollama >nul 2>&1
    if errorlevel 1 (
        echo  [x] Ollama não está instalado: o jogo funciona, mas sem a IA.
        echo      Instale em https://ollama.com/download ou configure o Ollama Cloud no .env
    ) else (
        ollama list 2>nul | findstr /i /c:"!MODELO!" >nul
        if errorlevel 1 (
            echo  [..] O modelo !MODELO! ainda não foi baixado - são alguns GB.
            choice /c SN /m "  Baixar agora"
            if not errorlevel 2 ollama pull !MODELO!
        ) else (
            echo  [ok] IA: Ollama local, modelo !MODELO!
        )
    )
)

rem ---------- 4. Firewall: liberar a porta para a rede local ----------
netsh advfirewall firewall show rule name="%REGRA%" >nul 2>&1
if errorlevel 1 (
    echo  [..] Liberando a porta %PORTA% no firewall - o Windows vai pedir permissão de administrador.
    powershell -NoProfile -Command "Start-Process netsh -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList 'advfirewall firewall add rule name=%REGRA% dir=in action=allow protocol=TCP localport=%PORTA% remoteip=localsubnet profile=any'" >nul 2>&1
    netsh advfirewall firewall show rule name="%REGRA%" >nul 2>&1
    if errorlevel 1 (
        echo  [x] Não foi possível liberar o firewall. Só este computador vai conseguir jogar.
        echo      Para liberar, rode este arquivo como administrador uma vez.
    ) else (
        echo  [ok] Porta %PORTA% liberada para a rede local
    )
) else (
    echo  [ok] Porta %PORTA% já liberada no firewall
)

rem ---------- 5. Endereços e servidor ----------
echo.
echo  ===============================================
echo    Jogue neste computador:  http://localhost:%PORTA%
echo    Na mesma rede, use um destes endereços:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { '      http://' + $_.IPAddress + ':%PORTA%' }"
echo.
echo    Para desligar o servidor: feche esta janela ou aperte Ctrl+C
echo  ===============================================
echo.
"%VPY%" -m uvicorn app:app --host 0.0.0.0 --port %PORTA%
echo.
echo  O servidor parou.
pause
