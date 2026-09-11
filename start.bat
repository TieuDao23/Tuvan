@echo off
chcp 65001 >nul
title Suna Chat 2.0 - Local & LAN Server (Zero-CORS)

cls
echo =======================================================
echo          🌸 SUNA CHAT 2.0 - ZERO-CORS SERVER 🌸
echo =======================================================
echo.

:: Tim dia chi IP mang LAN
set "LAN_IP="
for /f "tokens=4" %%a in ('route print ^| findstr 0.0.0.0.*0.0.0.0') do (
    if not defined LAN_IP if not "%%a"=="0.0.0.0" set "LAN_IP=%%a"
)

echo  [1/2] Dang khoi dong Web Server co san Reverse Proxy Zero-CORS...
echo  [2/2] Dang tu dong mo trinh duyet...
echo.
echo  =======================================================
echo   🖥️  Tren may tinh nay: http://localhost:8080
if defined LAN_IP (
echo   📱  Thiet bi khac (cung Wi-Fi): http://%LAN_IP%:8080
) else (
echo   📱  Thiet bi khac (cung Wi-Fi): http://192.168.1.20:8080
)
echo   ⛔  Nhan Ctrl + C de dung server.
echo  =======================================================
echo.

:: Mo trinh duyet sau 1 giay
start "" http://localhost:8080

:: Kiem tra Python va chay Server co ho tro proxy
python --version >nul 2>&1
if %errorlevel% equ 0 (
    if exist server.py (
        python server.py 8080
    ) else (
        python -m http.server 8080 --bind 0.0.0.0
    )
) else (
    py --version >nul 2>&1
    if %errorlevel% equ 0 (
        if exist server.py (
            py server.py 8080
        ) else (
            py -m http.server 8080 --bind 0.0.0.0
        )
    ) else (
        echo [INFO] Khoi dong bang npx serve...
        npx --yes serve -p 8080 -a 0.0.0.0 .
    )
)

pause
