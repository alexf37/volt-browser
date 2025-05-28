// The ElectronAPI interface and declare global block are now in renderer.d.ts

document.addEventListener("DOMContentLoaded", () => {
  const tabsContainer = document.getElementById("tabs-container") as HTMLDivElement;
  const addTabBtn = document.getElementById("add-tab-btn") as HTMLButtonElement;
  const urlInput = document.getElementById("url-input") as HTMLInputElement;

  if (!tabsContainer || !addTabBtn || !urlInput) {
    console.error("Required UI elements not found!");
    return;
  }

  function addTabToUI(
    tabId: number,
    url: string,
    title: string = "New Tab",
    isActive: boolean = false
  ): void {
    const tabElement = document.createElement("div");
    tabElement.className = "tab";
    tabElement.dataset.tabId = tabId.toString();

    const titleElement = document.createElement("span");
    titleElement.className = "tab-title";
    titleElement.textContent = title;
    tabElement.appendChild(titleElement);

    const closeButton = document.createElement("button");
    closeButton.className = "tab-close-btn";
    closeButton.innerHTML = "&times;"; // Using innerHTML for simple cross icon
    closeButton.title = "Close Tab";
    closeButton.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent tab activation when clicking close
      window.electronAPI.closeTab(tabId);
    });
    tabElement.appendChild(closeButton);

    tabElement.addEventListener("click", () => {
      window.electronAPI.activateTab(tabId);
    });

    tabsContainer.appendChild(tabElement);
    if (isActive) {
      setActiveTabUI(tabId);
    }
  }

  function setActiveTabUI(activeTabId: number): void {
    document.querySelectorAll(".tab").forEach((tab) => {
      const tabElement = tab as HTMLDivElement;
      if (tabElement.dataset.tabId === activeTabId.toString()) {
        tabElement.classList.add("active");
      } else {
        tabElement.classList.remove("active");
      }
    });
  }

  function removeTabFromUI(tabId: number): void {
    const tabElement = tabsContainer.querySelector(`.tab[data-tab-id='${tabId}']`);
    if (tabElement) {
      tabsContainer.removeChild(tabElement);
    }
    // If no tabs are left, maybe show a placeholder or instruct user to add a new tab.
    if (tabsContainer.children.length === 0) {
      urlInput.value = "";
      // Potentially, create a new default tab if all are closed from main process's perspective
      // window.electronAPI.createNewTab(); // Or let main decide this
    }
  }

  function updateTabTitleInUI(tabId: number, title: string): void {
    const tabElement = tabsContainer.querySelector(`.tab[data-tab-id='${tabId}'] .tab-title`);
    if (tabElement) {
      tabElement.textContent = title.length > 25 ? title.substring(0, 22) + "..." : title; // Truncate long titles
    }
  }

  // Event Listeners from Main Process
  window.electronAPI.onNewTabCreated((tabId, url, isActive) => {
    const initialTitle = url.startsWith("http") ? new URL(url).hostname : "New Tab";
    addTabToUI(tabId, url, initialTitle, isActive);
  });

  window.electronAPI.onTabActivated((tabId) => {
    setActiveTabUI(tabId);
    // The URL will be updated by onTabUrlUpdated
  });

  window.electronAPI.onTabClosed((tabId) => {
    removeTabFromUI(tabId);
  });

  window.electronAPI.onTabUrlUpdated((url) => {
    urlInput.value = url;
  });

  window.electronAPI.onTabTitleUpdated((tabId, title) => {
    updateTabTitleInUI(tabId, title);
  });

  // UI Event Handlers
  addTabBtn.addEventListener("click", () => {
    window.electronAPI.createNewTab();
  });

  urlInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      let url = urlInput.value.trim();
      if (url) {
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          url = "https://" + url;
        }
        window.electronAPI.navigateToUrl(url);
      }
    }
  });

  // Initialize: Get current active tab from main and set UI accordingly
  async function initializeTabs() {
    const activeTabId = await window.electronAPI.getActiveTabId();
    // The main process creates an initial tab. We rely on onNewTabCreated for the first tab.
    // If there was a way to get all existing tabs on startup, we could populate them here.
    // For now, the main process should send 'new-tab-created' for the very first tab.
    if (activeTabId !== null) {
      setActiveTabUI(activeTabId);
      // Request URL for the initially active tab if needed, though createNewTab should handle first load.
    }
  }

  initializeTabs().catch(console.error);

  console.log("Renderer script loaded and initialized.");
});
