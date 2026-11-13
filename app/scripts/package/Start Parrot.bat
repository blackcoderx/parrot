@echo off
title Parrot
"%~dp0node\node.exe" "%~dp0launcher.mjs"
if errorlevel 1 pause
