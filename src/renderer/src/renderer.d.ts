export {}; // This ensures the file is treated as a module, which is good practice for .d.ts files too.

declare global {
  interface Window {
    electronAPI: {
      onNewTabCreated: (
        callback: (tabId: number, url: string, isActive: boolean) => void
      ) => () => void;
      onTabActivated: (callback: (tabId: number) => void) => () => void;
      onTabClosed: (callback: (tabId: number) => void) => () => void;
      onTabUrlUpdated: (callback: (url: string) => void) => () => void;
      onTabTitleUpdated: (callback: (tabId: number, title: string) => void) => () => void;
      onSidebarVisibilityDidChange: (callback: (visible: boolean) => void) => () => void;
      onIamSidebarView: (callback: () => void) => () => void;
      onIamCornerMaskView: (callback: () => void) => () => void;
      createNewTab: (url?: string) => void;
      navigateToUrl: (url: string) => void;
      navigateBack: () => void;
      activateTab: (tabId: number) => void;
      closeTab: (tabId: number) => void;
      sendMessage: (channel: string, ...args: unknown[]) => void;
      getActiveTabId: () => Promise<number | null>;
      closeWindow: () => void;
      minimizeWindow: () => void;
      maximizeWindow: () => void;
    };
  }
}
