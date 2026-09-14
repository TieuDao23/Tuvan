@echo off
chcp 65001 >nul
title Suna Chat 2.0 - Local Server (Zero-CORS)

cls
echo =======================================================
echo          🌸 SUNA CHAT 2.0 - ZERO-CORS SERVER 🌸
echo =======================================================
echo.

echo  [1/2] Dang khoi dong Web Server co san Reverse Proxy Zero-CORS...
echo  [2/2] Dang tu dong mo trinh duyet...
echo.
echo  =======================================================
echo   🖥️  Tren may tinh nay: http://localhost:8080
echo   🔒  Chi truy cap tu may tinh nay (bao ve API key).
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
        python -m http.server 8080 --bind 127.0.0.1
    )
) else (
    py --version >nul 2>&1
    if %errorlevel% equ 0 (
        if exist server.py (
            py server.py 8080
        ) else (
            py -m http.server 8080 --bind 127.0.0.1
        )
    ) else (
        echo [INFO] Khoi dong bang npx serve...
        npx --yes serve -p 8080 -a 127.0.0.1 .
    )
)

pause
