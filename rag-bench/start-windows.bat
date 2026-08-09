@echo off
title MAHAGENCO - Local RAG Bench
cd /d "%~dp0"
set PY=
where python  >nul 2>nul && set PY=python
if "%PY%"=="" ( where py      >nul 2>nul && set PY=py )
if "%PY%"=="" ( where python3 >nul 2>nul && set PY=python3 )
if "%PY%"=="" goto :nopy

if not exist "vendor\ort\ort-wasm-simd-threaded.asyncify.wasm" (
  echo.
  echo   First run: fetching the runtime and the embedding model, about 85 MB.
  echo   This happens once and needs internet. After it, the bench works
  echo   with the network unplugged.
  echo.
  %PY% get-models.py vendor
  echo.
)
if not exist "models\Xenova\bge-small-en-v1.5\onnx\model_quantized.onnx" (
  %PY% get-models.py embedder
  echo.
)
echo.
echo   MAHAGENCO - Local RAG Bench
echo   Starting a local web server. Leave this window open; close it to stop.
echo.
%PY% serve.py
goto :eof

:nopy
echo.
echo   Python was not found on this machine.
echo   Install it from python.org (tick "Add python.exe to PATH"), or serve
echo   this folder with any static web server and open http://localhost/
echo.
pause
