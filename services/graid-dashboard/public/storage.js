const storageElement = (id) => document.getElementById(id);

if (new URLSearchParams(window.location.search).has("embed")) {
  document.body.classList.add("embed");
}

function setStorageText(id, value) {
  storageElement(id).textContent = value;
}

function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(Number(bytes))) return "Unavailable";

  const value = Number(bytes);
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const unitIndex = value === 0
    ? 0
    : Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const converted = value / (1024 ** unitIndex);
  const decimals = unitIndex >= 4 ? 2 : 1;
  return `${converted.toFixed(decimals)} ${units[unitIndex]}`;
}

function renderFolders(folders) {
  const container = storageElement("folderBreakdown");
  container.replaceChildren();

  if (!Array.isArray(folders) || folders.length === 0) {
    const loading = document.createElement("span");
    loading.className = "folder-loading";
    loading.textContent = "Calculating folder sizes...";
    container.appendChild(loading);
    return;
  }

  folders.slice(0, 3).forEach((folder) => {
    const item = document.createElement("div");
    item.className = "folder-item";

    const name = document.createElement("span");
    name.textContent = folder.name;

    const size = document.createElement("strong");
    size.textContent = formatBytes(folder.bytes);

    item.append(name, size);
    container.appendChild(item);
  });
}

async function refreshStorage() {
  try {
    const response = await fetch("/api/storage", { cache: "no-store" });
    if (!response.ok) throw new Error(`Storage returned HTTP ${response.status}`);

    const storage = await response.json();
    if (!storage.online) throw new Error(storage.error || "G-RAID storage is unavailable");

    const percent = Math.max(0, Math.min(100, Number(storage.usedPercent) || 0));
    setStorageText("usedPercent", `${percent.toFixed(percent % 1 ? 1 : 0)}%`);
    setStorageText("usedSpace", formatBytes(storage.usedBytes));
    setStorageText("freeSpace", formatBytes(storage.freeBytes));
    setStorageText("totalSpace", formatBytes(storage.totalBytes));
    setStorageText("storageHealth", storage.health || "Unknown");
    setStorageText("storageStatus", "Live capacity");
    renderFolders(storage.folders);

    const ring = storageElement("storageRing");
    ring.style.setProperty("--storage-fill", `${percent}%`);
    ring.dataset.level = storage.spaceLevel;

    storageElement("storageHealth").className =
      storage.health === "Healthy" ? "storage-health healthy" : "storage-health";
    storageElement("storageDot").className = "dot";
    storageElement("spaceWarning").className =
      percent >= 85 ? `space-warning show ${storage.spaceLevel}` : "space-warning";
    storageElement("storageError").className = "error";
  } catch (error) {
    storageElement("storageDot").className = "dot offline";
    setStorageText("storageStatus", "Storage unavailable");
    setStorageText("storageError", error.message);
    storageElement("storageError").className = "error show";
  }
}

refreshStorage();
setInterval(refreshStorage, 30000);
