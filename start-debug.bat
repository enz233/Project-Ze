echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
set PROJECT_ZE_SCREEN_POINTER_DEBUG=1
echo PROJECT_ZE_SCREEN_POINTER_DEBUG=1
echo Screen pointer debug screenshots will be saved under Electron userData\screen-pointer-debug.
npm run dev
pause
