import React, { useState, useEffect, useRef, KeyboardEvent, JSX } from "react";

interface TabData {
  id: number;
  url: string;
  title: string;
  isActive: boolean;
}

const BEZEL_WIDTH = 8; // px
const URL_BAR_HEIGHT_CONST_CLASS = "h-12"; // Tailwind class for URL bar height

function App(): JSX.Element {
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [urlInputValue, setUrlInputValue] = useState<string>("");
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [isSidebarLocallyVisible, setIsSidebarLocallyVisible] = useState<boolean>(false); // Tracks renderer's belief
  const [isSidebarView, setIsSidebarView] = useState<boolean>(false);
  const appElementRef = useRef<HTMLDivElement>(null); // Ref for the main app div in sidebar view
  const sidebarOpenTimeRef = useRef<number>(0); // Track when sidebar was last opened

  useEffect(() => {
    // Listen for identity confirmation from main process
    const cleanupIamSidebar = window.electronAPI.onIamSidebarView(() => {
      setIsSidebarView(true);
    });

    // Listen for visibility changes from main process
    const cleanupVisibilityChange = window.electronAPI.onSidebarVisibilityDidChange((visible) => {
      setIsSidebarLocallyVisible(visible); // Sync local state with main process truth
      if (visible) {
        sidebarOpenTimeRef.current = Date.now(); // Record when sidebar was opened
      }
    });

    return () => {
      cleanupIamSidebar();
      cleanupVisibilityChange();
    };
  }, []);

  useEffect(() => {
    const cleanupNewTab = window.electronAPI.onNewTabCreated(
      (tabId, url /*, isActive (removed) */) => {
        const newTab: TabData = {
          id: tabId,
          url,
          title: url.startsWith("http") ? new URL(url).hostname : "New Tab",
          isActive: false
        };
        setTabs((prevTabs) => [...prevTabs, newTab]);
      }
    );

    const cleanupTabActivated = window.electronAPI.onTabActivated((tabId) => {
      setTabs((prevTabs) =>
        prevTabs.map((tab) =>
          tab.id === tabId ? { ...tab, isActive: true } : { ...tab, isActive: false }
        )
      );
    });

    const cleanupTabClosed = window.electronAPI.onTabClosed((tabId) => {
      setTabs((prevTabs) => prevTabs.filter((tab) => tab.id !== tabId));
    });

    const cleanupUrlUpdated = window.electronAPI.onTabUrlUpdated((url) => {
      setUrlInputValue(url);
    });

    const cleanupTitleUpdated = window.electronAPI.onTabTitleUpdated((tabId, title) => {
      setTabs((prevTabs) =>
        prevTabs.map((tab) =>
          tab.id === tabId
            ? { ...tab, title: title.length > 30 ? title.substring(0, 27) + "..." : title } // Adjusted title length for Tailwind
            : tab
        )
      );
    });

    async function fetchInitialActiveTab() {
      const currentActiveTabId = await window.electronAPI.getActiveTabId();
      if (currentActiveTabId !== null) {
        setTabs((prevTabs) => {
          const updatedTabs = prevTabs.map((tab) =>
            tab.id === currentActiveTabId ? { ...tab, isActive: true } : { ...tab, isActive: false }
          );
          const activeTabData = updatedTabs.find((t) => t.id === currentActiveTabId && t.isActive);
          if (activeTabData) {
            setUrlInputValue(activeTabData.url);
          }
          return updatedTabs;
        });
      }
    }
    fetchInitialActiveTab().catch(console.error);

    return () => {
      cleanupNewTab();
      cleanupTabActivated();
      cleanupTabClosed();
      cleanupUrlUpdated();
      cleanupTitleUpdated();
    };
  }, []);

  useEffect(() => {
    if (tabs.length === 0) {
      setUrlInputValue("");
    }
    const currentActiveTab = tabs.find((tab) => tab.isActive);
    if (currentActiveTab) {
      setUrlInputValue(currentActiveTab.url);
    } else if (tabs.length > 0 && !tabs.some((t) => t.isActive)) {
      // Potentially handle state where no tab is active
    }
  }, [tabs]);

  useEffect(() => {
    // For the MAIN view: detect mouse enter in bezel to SHOW sidebar
    function handleMouseMoveForMainView(event: MouseEvent) {
      if (isSidebarView) return; // This logic is only for the main view

      if (event.clientX < BEZEL_WIDTH && !isSidebarLocallyVisible) {
        window.electronAPI.sendMessage("set-sidebar-visibility", true);
      }
    }

    // For the SIDEBAR view: detect mouse leave to HIDE sidebar
    function handleMouseLeaveForSidebarView() {
      if (!isSidebarView) return; // This logic is only for the sidebar view
      if (isSidebarLocallyVisible) {
        // Check if sidebar was opened recently (within 100ms)
        const timeSinceOpen = Date.now() - sidebarOpenTimeRef.current;
        if (timeSinceOpen < 100) {
          // Too soon to close, ignore this mouse leave
          return;
        }
        // only send if it's currently visible
        window.electronAPI.sendMessage("set-sidebar-visibility", false);
      }
    }

    if (isSidebarView && appElementRef.current) {
      appElementRef.current.addEventListener("mouseleave", handleMouseLeaveForSidebarView);
    } else {
      window.addEventListener("mousemove", handleMouseMoveForMainView);
    }

    return () => {
      if (isSidebarView && appElementRef.current) {
        appElementRef.current.removeEventListener("mouseleave", handleMouseLeaveForSidebarView);
      } else {
        window.removeEventListener("mousemove", handleMouseMoveForMainView);
      }
    };
  }, [isSidebarLocallyVisible, isSidebarView, appElementRef]);

  function handleAddTabClick(): void {
    window.electronAPI.createNewTab();
  }

  function handleUrlInputChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setUrlInputValue(event.target.value);
  }

  function handleUrlInputKeyPress(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      let url = urlInputValue.trim();
      if (url) {
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          url = `https://${url}`;
        }
        window.electronAPI.navigateToUrl(url);
        urlInputRef.current?.blur();
      }
    }
  }

  function handleTabClick(tabId: number): void {
    window.electronAPI.activateTab(tabId);
  }

  function handleCloseTabClick(event: React.MouseEvent<HTMLButtonElement>, tabId: number) {
    event.stopPropagation();
    window.electronAPI.closeTab(tabId);
  }

  if (isSidebarView) {
    return (
      <div ref={appElementRef} className="h-screen py-1 pl-1 flex flex-col">
        <div className="flex bg-gray-900/75 backdrop-blur-lg border shadow-2xl shadow-black/50 border-gray-700 rounded-lg flex-col h-full">
          <div className="flex items-center px-3 pt-3 pb-2">
            <div className="flex space-x-2">
              <button
                onClick={() => window.electronAPI.closeWindow()}
                className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors duration-150 group relative"
                title="Close"
              >
                <svg
                  className="absolute inset-0 w-full h-full opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                  viewBox="0 0 12 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3.5 3.5L8.5 8.5M8.5 3.5L3.5 8.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    className="text-red-900"
                  />
                </svg>
              </button>

              {/* Minimize button - Yellow */}
              <button
                onClick={() => window.electronAPI.minimizeWindow()}
                className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors duration-150 group relative"
                title="Minimize"
              >
                <svg
                  className="absolute inset-0 w-full h-full opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                  viewBox="0 0 12 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 6H9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    className="text-yellow-900"
                  />
                </svg>
              </button>

              {/* Maximize button - Green */}
              <button
                onClick={() => window.electronAPI.maximizeWindow()}
                className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors duration-150 group relative"
                title="Maximize"
              >
                <svg
                  className="absolute inset-0 w-full h-full opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                  viewBox="0 0 12 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3.5 3.5L6 6M6 6L8.5 3.5M6 6L3.5 8.5M6 6L8.5 8.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    className="text-green-900"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* URL Bar in Sidebar */}
          <div
            className={`flex items-center ${URL_BAR_HEIGHT_CONST_CLASS} border-b border-gray-700 px-3`}
          >
            <input
              ref={urlInputRef}
              type="text"
              className="flex-grow px-3 py-2 text-sm bg-gray-700 text-gray-100 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all duration-150 placeholder-gray-400"
              placeholder="Enter URL and press Enter"
              value={urlInputValue}
              onChange={handleUrlInputChange}
              onKeyPress={handleUrlInputKeyPress}
            />
          </div>

          {/* Add New Tab Button */}
          <button
            className="p-3 m-3 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 hover:text-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-purple-500 flex items-center justify-start text-sm font-medium"
            title="New Tab"
            onClick={handleAddTabClick}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-2 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Tab
          </button>

          {/* Tabs List - Vertical */}
          <div className="flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`flex items-center justify-between px-3 py-3 text-sm cursor-pointer transition-all duration-150 ease-in-out border-b border-gray-800
                          ${
                            tab.isActive
                              ? "bg-purple-600/20 text-purple-300 border-l-4 border-l-purple-500"
                              : "text-gray-300 hover:bg-gray-800 hover:text-white"
                          }`}
                title={tab.title}
                onClick={() => handleTabClick(tab.id)}
              >
                <span className="flex-grow truncate mr-2">{tab.title}</span>
                <button
                  className="flex-shrink-0 p-1 rounded-full hover:bg-red-500/20 text-gray-400 hover:text-red-400 opacity-70 hover:opacity-100 transition-all duration-150"
                  title="Close Tab"
                  onClick={(e) => handleCloseTabClick(e, tab.id)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Main view content
  return (
    <div className="flex h-screen bg-gray-100 relative overflow-hidden">
      {/* Gradient Bezel */}
      <div
        className="absolute inset-0 pointer-events-none z-40"
        style={{
          background: `
            linear-gradient(to right, #ec4899 0px, #c084fc ${BEZEL_WIDTH}px, transparent ${BEZEL_WIDTH}px),
            linear-gradient(to left, #ec4899 0px, #c084fc ${BEZEL_WIDTH}px, transparent ${BEZEL_WIDTH}px),
            linear-gradient(to bottom, #ec4899 0px, #c084fc ${BEZEL_WIDTH}px, transparent ${BEZEL_WIDTH}px),
            linear-gradient(to top, #ec4899 0px, #c084fc ${BEZEL_WIDTH}px, transparent ${BEZEL_WIDTH}px)
          `,
          padding: `${BEZEL_WIDTH}px`
        }}
      >
        {/* Left bezel hover area for sidebar trigger */}
        <div
          className="absolute left-0 top-0 bottom-0 pointer-events-auto"
          style={{ width: `${BEZEL_WIDTH}px` }}
        />
      </div>

      {/* Main Content Area - WebContentsView will be positioned here */}
      <div
        className="flex-grow bg-white relative"
        style={{
          margin: `${BEZEL_WIDTH}px`,
          borderRadius: "8px",
          overflow: "hidden",
          clipPath: "inset(0 round 8px)"
        }}
      >
        {/* WebContentsView is managed by the main process and overlays this area */}
      </div>
    </div>
  );
}

export default App;
