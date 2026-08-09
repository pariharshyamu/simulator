@echo off
cd /d "%~dp0"
where python >nul 2>nul && ( python get-models.py %* & pause & goto :eof )
where py     >nul 2>nul && ( py     get-models.py %* & pause & goto :eof )
echo Python not found. Install from python.org and tick "Add to PATH".
pause
