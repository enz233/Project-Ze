# Project-Ze verification

Use this when verifying runtime behavior for the Electron desktop companion.

## Launch

The Claude Code environment may set `ELECTRON_RUN_AS_NODE=1`, which makes Electron run the app as plain Node and causes `ipcMain` to be undefined. Launch with that variable removed:

```bash
env -u ELECTRON_RUN_AS_NODE npm start
```

Expected startup evidence includes:

```txt
> project-ze@<version> start
> npm run build && electron .
[Observer] 观察系统已启动，间隔 30 秒
```

On Windows, confirm the GUI surface exists with:

```bash
powershell.exe -NoProfile -Command "Get-Process electron -ErrorAction SilentlyContinue | Select-Object -First 5 Id,ProcessName,MainWindowTitle | Format-Table -AutoSize"
```

A successful launch should show an Electron process with `MainWindowTitle` similar to `Project-Ze`.

## Flows worth driving

- Open the app and confirm it does not crash on startup.
- Wait for at least one observer tick or inspect stdout for observer startup.
- For proactive-reaction changes, switch between work/rest apps manually and watch observer/proactive logs.
- Press F3 in the app to open the debug window and inspect logs/memory if a visual check is needed.

## Cleanup

Prefer stopping the background `npm start` task with TaskStop. If child Electron processes remain, ask before killing broad process sets; use exact PIDs when possible.
