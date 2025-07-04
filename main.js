const { app, BrowserWindow, shell } = require("electron");

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 20, y: 30 },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL("http://localhost:3000"); // Adjust the URL to your Next.js app
};

app.whenReady().then(() => {
  createWindow();
});
