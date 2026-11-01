@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 个人工作生活 App
python server.py
echo.
echo 服务已停止，按任意键关闭窗口。
pause >nul
