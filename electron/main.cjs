// Overlay: the built site in an always-on-top window. Ctrl+Alt+E shows/hides it without taking focus from the game.
const { app, BrowserWindow, globalShortcut } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { serveDir } = require('./serve.cjs');

const SHORTCUT = 'Control+Alt+E';
const smoke = process.argv.includes('--smoke'); // headless-ish check used by `npm run overlay:smoke`

async function waitForText(win, needle, ms) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) {
    const text = await win.webContents.executeJavaScript('document.body.innerText');
    if (text.includes(needle)) return text;
  }
  return null;
}

app.whenReady().then(async () => {
  const dist = path.join(__dirname, '..', 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error('dist/ not found: run `npm run overlay` (it builds the site first).');
    return app.exit(1);
  }
  const server = await serveDir(dist);
  const win = new BrowserWindow({
    width: 460, height: 740, title: 'E7 Meta', autoHideMenuBar: true, opacity: 0.94, alwaysOnTop: true, show: !smoke,
  });
  win.setAlwaysOnTop(true, 'screen-saver'); // stays above a windowed or borderless game, not above exclusive fullscreen
  await win.loadURL(`http://127.0.0.1:${server.address().port}/`);

  const registered = globalShortcut.register(SHORTCUT, () => (win.isVisible() ? win.hide() : win.showInactive()));
  if (!registered) console.warn(`Shortcut ${SHORTCUT} unavailable (already taken by another app).`);

  if (smoke) {
    const text = await waitForText(win, 'PvE', 10000);
    console.log(`SMOKE ${text ? 'OK' : 'FAIL'} alwaysOnTop=${win.isAlwaysOnTop()} shortcut=${registered} text=${JSON.stringify((text ?? '').slice(0, 60))}`);
    app.exit(text && registered && win.isAlwaysOnTop() ? 0 : 1);
  }
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
