import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

// Custom APIs for renderer
const api = {};

// White-listed channels for IPC communication (Removed as it was unused for now)
// const validChannels = [
//   "create-new-tab",
//   "navigate-to-url",
//   "activate-tab",
//   "close-tab",
//   "tab-url-updated",
//   "new-tab-created",
//   "tab-activated",
//   "tab-closed",
//   "tab-title-updated"
// ];

contextBridge.exposeInMainWorld("electronAPI", {
  // Main to Renderer (one-way)
  onNewTabCreated: (callback: (tabId: number, url: string, isActive: boolean) => void) => {
    const handler = (_event, tabId, url, isActive) => callback(tabId, url, isActive);
    ipcRenderer.on("new-tab-created", handler);
    return () => ipcRenderer.removeListener("new-tab-created", handler);
  },
  onTabActivated: (callback: (tabId: number) => void) => {
    const handler = (_event, tabId) => callback(tabId);
    ipcRenderer.on("tab-activated", handler);
    return () => ipcRenderer.removeListener("tab-activated", handler);
  },
  onTabClosed: (callback: (tabId: number) => void) => {
    const handler = (_event, tabId) => callback(tabId);
    ipcRenderer.on("tab-closed", handler);
    return () => ipcRenderer.removeListener("tab-closed", handler);
  },
  onTabUrlUpdated: (callback: (url: string) => void) => {
    const handler = (_event, url) => callback(url);
    ipcRenderer.on("tab-url-updated", handler);
    return () => ipcRenderer.removeListener("tab-url-updated", handler);
  },
  onTabTitleUpdated: (callback: (tabId: number, title: string) => void) => {
    const handler = (_event, tabId, title) => callback(tabId, title);
    ipcRenderer.on("tab-title-updated", handler);
    return () => ipcRenderer.removeListener("tab-title-updated", handler);
  },
  onSidebarVisibilityDidChange: (callback: (visible: boolean) => void) => {
    const handler = (_event, visible) => callback(visible);
    ipcRenderer.on("sidebar-visibility-did-change", handler);
    return () => ipcRenderer.removeListener("sidebar-visibility-did-change", handler);
  },
  onIamSidebarView: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("iam-sidebar-view", handler);
    return () => ipcRenderer.removeListener("iam-sidebar-view", handler);
  },
  onIamCornerMaskView: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("iam-corner-mask-view", handler);
    return () => ipcRenderer.removeListener("iam-corner-mask-view", handler);
  },

  // Renderer to Main (one-way)
  createNewTab: (url?: string) => {
    ipcRenderer.send("create-new-tab", url);
  },
  navigateToUrl: (url: string) => {
    ipcRenderer.send("navigate-to-url", url);
  },
  activateTab: (tabId: number) => {
    ipcRenderer.send("activate-tab", tabId);
  },
  closeTab: (tabId: number) => {
    ipcRenderer.send("close-tab", tabId);
  },
  sendMessage: (channel: string, ...args: unknown[]) => {
    ipcRenderer.send(channel, ...args);
  },

  // Window controls
  closeWindow: () => {
    ipcRenderer.send("window-close");
  },
  minimizeWindow: () => {
    ipcRenderer.send("window-minimize");
  },
  maximizeWindow: () => {
    ipcRenderer.send("window-maximize");
  },

  // Renderer to Main (two-way)
  getActiveTabId: (): Promise<number | null> => {
    return ipcRenderer.invoke("get-active-tab-id");
  }
});

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}

console.log("Preload script loaded.");
