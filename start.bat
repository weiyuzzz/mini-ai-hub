@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo ================================================
echo   Mini AI Hub - 启动中...
echo ================================================
echo.

rem ---- 寻找 Python ----
set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY (
    where py >nul 2>nul && set "PY=py"
)
if not defined PY (
    echo [错误] 未找到 Python。请先安装 Python 3.8+ 并勾选 "Add to PATH"。
    echo        下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

rem ---- 依赖检查与安装 ----
%PY% -c "import flask, psutil" >nul 2>nul
if errorlevel 1 (
    echo [安装] 首次运行，正在安装依赖 flask / psutil ...
    %PY% -m pip install -r requirements.txt
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络后重试，或手动执行:
        echo        %PY% -m pip install -r requirements.txt
        pause
        exit /b 1
    )
)

rem ---- 启动服务 ----
echo [启动] 服务运行后，请在 iPad 浏览器打开下方显示的局域网地址。
echo.
%PY% backend\app.py

echo.
echo [退出] 服务已停止。
pause
