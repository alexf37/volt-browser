import { app, shell, BrowserWindow, ipcMain, WebContentsView, BrowserView } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200, // Increased width for tabs and URL bar
    height: 800, // Increased height
    show: false,
    autoHideMenuBar: true,
    frame: false, // This removes the entire frame including window controls
    transparent: true, // Allow transparency for custom styling
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true // Recommended for security
    }
  });

  // Tab Management
  const tabs = new Map<number, WebContentsView>();
  let activeTabId: number | null = null;
  let nextTabId = 1;
  const bezelWidth = 8; // Must match the bezel width in renderer
  const sidebarWidth = 280; // Must match sidebar width in renderer

  // Create a BrowserView for the sidebar overlay
  const sidebarView = new BrowserView({
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true
    }
  });

  // Add sidebar view to window but position it off-screen initially
  mainWindow.addBrowserView(sidebarView);
  sidebarView.setBounds({
    x: -sidebarWidth,
    y: 0,
    width: sidebarWidth,
    height: mainWindow.getContentBounds().height
  });
  sidebarView.setAutoResize({ width: false, height: true });

  // Load the same renderer URL for sidebar (we'll handle different content via CSS/JS)
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    sidebarView.webContents.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    sidebarView.webContents.loadFile(join(__dirname, "../renderer/index.html"));
  }
  // Tell the sidebar view that it is the sidebar
  sidebarView.webContents.once("dom-ready", () => {
    sidebarView.webContents.send("iam-sidebar-view");
  });

  function getCurrentContentViewSize() {
    const { width, height } = mainWindow.getContentBounds();
    return {
      x: bezelWidth,
      y: bezelWidth,
      contentWidth: width - bezelWidth * 2,
      contentHeight: height - bezelWidth * 2
    };
  }

  function updateSidebarVisibility(visible: boolean) {
    const { height } = mainWindow.getContentBounds();
    const startX = sidebarView.getBounds().x;
    const targetX = visible ? 0 : -sidebarWidth;
    const duration = 200; // Animation duration in ms
    const startTime = Date.now();

    // If showing, bring to top immediately
    if (visible) {
      mainWindow.setTopBrowserView(sidebarView);
    }

    // Animation function
    function animate() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out cubic)
      const eased = 1 - Math.pow(1 - progress, 3);

      const currentX = startX + (targetX - startX) * eased;

      sidebarView.setBounds({
        x: Math.round(currentX),
        y: 0,
        width: sidebarWidth,
        height
      });

      if (progress < 1) {
        // Continue animation
        setImmediate(animate);
      }
    }

    // Start animation
    animate();

    // Notify all renderers about the change
    broadcastToAllViews("sidebar-visibility-did-change", visible);
  }

  // IPC handler for sidebar visibility requests from renderers
  ipcMain.on("set-sidebar-visibility", (_event, visible: boolean) => {
    updateSidebarVisibility(visible);
  });

  // Forward tab events to sidebar view as well
  function broadcastToAllViews(channel: string, ...args: unknown[]) {
    mainWindow.webContents.send(channel, ...args);
    sidebarView.webContents.send(channel, ...args);
  }

  function createNewTab(url?: string) {
    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        sandbox: false,
        contextIsolation: true
      }
    });
    mainWindow.contentView.addChildView(view);
    const tabId = nextTabId++;
    tabs.set(tabId, view);

    const { x, y, contentWidth, contentHeight } = getCurrentContentViewSize();
    view.setBounds({ x, y, width: contentWidth, height: contentHeight });
    view.webContents.loadURL(url || "https://www.google.com");

    // Inject CSS to create rounded corners using pseudo-elements
    view.webContents.on("dom-ready", () => {
      view.webContents.insertCSS(`
        /* Create a pseudo-element overlay for corner masks */
        body::after {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          z-index: 999999;
          
          /* Create corner masks using multiple radial gradients */
          background:
            /* Top-left corner */
            radial-gradient(circle at 8px 8px, transparent 8px, #c084fc 8px) top left / 8px 8px no-repeat,
            /* Top-right corner */
            radial-gradient(circle at 0px 8px, transparent 8px, #c084fc 8px) top right / 8px 8px no-repeat,
            /* Bottom-left corner */
            radial-gradient(circle at 8px 0px, transparent 8px, #c084fc 8px) bottom left / 8px 8px no-repeat,
            /* Bottom-right corner */
            radial-gradient(circle at 0px 0px, transparent 8px, #c084fc 8px) bottom right / 8px 8px no-repeat;
        }
      `);
    });

    // Ensure sidebar stays on top when new tabs are created
    if (sidebarView.getBounds().x === 0) {
      mainWindow.setTopBrowserView(sidebarView);
    }

    view.webContents.on("did-finish-load", () => {
      if (activeTabId === tabId) {
        broadcastToAllViews("tab-url-updated", view.webContents.getURL());
      }
    });

    view.webContents.on("page-title-updated", (_, title) => {
      broadcastToAllViews("tab-title-updated", tabId, title);
    });

    broadcastToAllViews("new-tab-created", tabId, url || "https://www.google.com", true);
    activateTab(tabId);
  }

  function activateTab(tabId: number): void {
    tabs.forEach((view, id) => {
      const { x, y, contentWidth, contentHeight } = getCurrentContentViewSize();
      if (id === tabId) {
        view.setBounds({ x, y, width: contentWidth, height: contentHeight });
        activeTabId = id;
        broadcastToAllViews("tab-activated", tabId);
        broadcastToAllViews("tab-url-updated", view.webContents.getURL());
      } else {
        // Hide inactive tabs by setting their bounds to 0x0 or positioning them off-screen
        // Setting height to 0 is crucial if they remain in the view hierarchy
        // Ensure x and y are updated for potential future activation, even if width/height are 0
        view.setBounds({ x, y, width: 0, height: 0 });
      }
    });

    // Ensure sidebar stays on top after tab activation
    if (sidebarView.getBounds().x === 0) {
      mainWindow.setTopBrowserView(sidebarView);
    }
  }

  function closeTab(tabId: number): void {
    const view = tabs.get(tabId);
    if (view) {
      mainWindow.contentView.removeChildView(view);
      // WebContents are automatically destroyed when the view is removed from the hierarchy
      // and has no other references. explicit view.webContents.destroy() is not standard.
      tabs.delete(tabId);
      broadcastToAllViews("tab-closed", tabId);

      if (activeTabId === tabId) {
        activeTabId = null;
        const remainingTabIds = Array.from(tabs.keys());
        if (remainingTabIds.length > 0) {
          activateTab(remainingTabIds[0]);
        } else {
          // Renderer might clear URL bar or show a placeholder, main doesn't need to do much here
          // as no tab is active to display content for.
          broadcastToAllViews("tab-activated", null); // Inform renderer no tab is active
          broadcastToAllViews("tab-url-updated", ""); // Clear URL bar
        }
      }
    }
  }

  mainWindow.on("resize", () => {
    const { x, y, contentWidth, contentHeight } = getCurrentContentViewSize();
    tabs.forEach((view, id) => {
      if (id === activeTabId) {
        view.setBounds({ x, y, width: contentWidth, height: contentHeight });
      } else {
        // Inactive tabs are hidden by activateTab by setting their size to 0x0.
        // We ensure they are positioned correctly if they were to become active.
        // Their size remains 0x0 as set by activateTab.
        const currentBounds = view.getBounds();
        view.setBounds({ x, y, width: currentBounds.width, height: currentBounds.height });
      }
    });

    // Update sidebar height on resize
    const { height } = mainWindow.getContentBounds();
    const currentSidebarBounds = sidebarView.getBounds();
    sidebarView.setBounds({ ...currentSidebarBounds, height });

    // Ensure sidebar stays on top after resize if visible
    if (currentSidebarBounds.x === 0) {
      mainWindow.setTopBrowserView(sidebarView);
    }
  });

  // IPC Handlers
  ipcMain.on("create-new-tab", (_event, url?: string) => {
    createNewTab(url);
  });

  ipcMain.on("navigate-to-url", (_event, url: string) => {
    if (activeTabId !== null) {
      const activeView = tabs.get(activeTabId);
      if (activeView) {
        activeView.webContents.loadURL(url);
      }
    }
  });

  ipcMain.on("activate-tab", (_event, tabId: number) => {
    activateTab(tabId);
  });

  ipcMain.on("close-tab", (_event, tabId: number) => {
    closeTab(tabId);
  });

  ipcMain.handle("get-active-tab-id", () => {
    return activeTabId;
  });

  // Window control handlers
  ipcMain.on("window-close", () => {
    mainWindow.close();
  });

  ipcMain.on("window-minimize", () => {
    mainWindow.minimize();
  });

  ipcMain.on("window-maximize", () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  // Initial Tab
  createNewTab();

  // Open DevTools in a separate window in development
  if (is.dev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId("com.electron");

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC test
  ipcMain.on("ping", () => console.log("pong"));

  createWindow();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
