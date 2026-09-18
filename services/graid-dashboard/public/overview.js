const overviewElement = (id) => document.getElementById(id);

if (new URLSearchParams(window.location.search).has("embed")) {
  document.body.classList.add("embed");
}

let overviewSamples = [];

function setOverviewText(id, value) {
  overviewElement(id).textContent = value;
}

function formatOverviewBytes(bytes) {
  if (bytes == null || !Number.isFinite(Number(bytes))) return "Unavailable";
  const value = Number(bytes);
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = value === 0 ? 0 : Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const converted = value / (1024 ** index);
  return `${converted.toFixed(index >= 4 ? 2 : 1)} ${units[index]}`;
}

function formatOverviewHours(hours) {
  if (hours == null) return "Unavailable";
  return `${Math.floor(Number(hours) / 24).toLocaleString()} days`;
}

function renderOverviewFolders(folders) {
  const container = overviewElement("overviewFolders");
  container.replaceChildren();

  if (!Array.isArray(folders) || folders.length === 0) {
    const loading = document.createElement("span");
    loading.className = "folder-loading";
    loading.textContent = "Calculating folders...";
    container.appendChild(loading);
    return;
  }

  folders.slice(0, 3).forEach((folder) => {
    const row = document.createElement("div");
    const name = document.createElement("span");
    const size = document.createElement("strong");
    name.textContent = folder.name;
    size.textContent = formatOverviewBytes(folder.bytes);
    row.append(name, size);
    container.appendChild(row);
  });
}

function drawOverviewChart() {
  const canvas = overviewElement("overviewChart");
  const context = canvas.getContext("2d");
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.max(1, Math.round(bounds.width * ratio));
  canvas.height = Math.max(1, Math.round(bounds.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);

  const now = Date.now();
  const start = now - 24 * 60 * 60 * 1000;
  const samples = overviewSamples
    .map((sample) => ({
      temperature: Number(sample.temperature),
      timestamp: new Date(sample.timestamp).getTime()
    }))
    .filter((sample) => Number.isFinite(sample.temperature) && Number.isFinite(sample.timestamp) && sample.timestamp >= start)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (samples.length < 2) {
    overviewElement("overviewChartEmpty").classList.add("show");
    return;
  }
  overviewElement("overviewChartEmpty").classList.remove("show");

  const temperatures = samples.map((sample) => sample.temperature);
  const dataMinimum = Math.min(...temperatures);
  const dataMaximum = Math.max(...temperatures);
  const center = (dataMinimum + dataMaximum) / 2;
  const span = Math.max(6, dataMaximum - dataMinimum + 4);
  let minimumY = Math.floor(center - span / 2);
  let maximumY = Math.ceil(center + span / 2);
  const showWarningLine = dataMaximum >= 57;
  if (showWarningLine) maximumY = Math.max(62, maximumY);

  const padding = { top: 8, right: 8, bottom: 16, left: 27 };
  const width = bounds.width - padding.left - padding.right;
  const height = bounds.height - padding.top - padding.bottom;
  const xFor = (time) => padding.left + ((time - start) / (now - start)) * width;
  const yFor = (temp) => padding.top + ((maximumY - temp) / (maximumY - minimumY)) * height;
  const points = samples.map((sample) => ({ x: xFor(sample.timestamp), y: yFor(sample.temperature) }));

  function traceSmoothLine() {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length - 1; index += 1) {
      const midpointX = (points[index].x + points[index + 1].x) / 2;
      const midpointY = (points[index].y + points[index + 1].y) / 2;
      context.quadraticCurveTo(points[index].x, points[index].y, midpointX, midpointY);
    }
    const last = points[points.length - 1];
    const beforeLast = points[points.length - 2];
    context.quadraticCurveTo(beforeLast.x, beforeLast.y, last.x, last.y);
  }

  context.font = "8px system-ui";
  context.fillStyle = "#73869a";
  context.strokeStyle = "rgba(142,160,179,.12)";
  context.lineWidth = 1;

  [minimumY, (minimumY + maximumY) / 2, maximumY].forEach((value) => {
    const y = yFor(value);
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(bounds.width - padding.right, y);
    context.stroke();
    context.textAlign = "right";
    context.fillText(`${Math.round(value)}\u00B0`, padding.left - 4, y + 3);
  });

  [start, start + 12 * 60 * 60 * 1000, now].forEach((time) => {
    const x = xFor(time);
    context.beginPath();
    context.moveTo(x, padding.top);
    context.lineTo(x, bounds.height - padding.bottom);
    context.stroke();
  });

  if (showWarningLine) {
    context.save();
    context.setLineDash([4, 4]);
    context.strokeStyle = "rgba(255,101,122,.55)";
    context.beginPath();
    context.moveTo(padding.left, yFor(60));
    context.lineTo(bounds.width - padding.right, yFor(60));
    context.stroke();
    context.restore();
  }

  const gradient = context.createLinearGradient(0, padding.top, 0, bounds.height - padding.bottom);
  gradient.addColorStop(0, "rgba(102,183,255,.38)");
  gradient.addColorStop(.65, "rgba(102,183,255,.10)");
  gradient.addColorStop(1, "rgba(102,183,255,0)");

  traceSmoothLine();
  context.lineTo(points[points.length - 1].x, bounds.height - padding.bottom);
  context.lineTo(points[0].x, bounds.height - padding.bottom);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();

  traceSmoothLine();
  context.strokeStyle = "rgba(102,183,255,.22)";
  context.lineWidth = 6;
  context.stroke();

  traceSmoothLine();
  context.strokeStyle = "#66b7ff";
  context.lineWidth = 2.2;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();

  const latest = points[points.length - 1];
  context.beginPath();
  context.arc(latest.x, latest.y, 4.5, 0, Math.PI * 2);
  context.fillStyle = "rgba(102,183,255,.2)";
  context.fill();
  context.beginPath();
  context.arc(latest.x, latest.y, 2.2, 0, Math.PI * 2);
  context.fillStyle = "#9bd2ff";
  context.fill();

  context.fillStyle = "#73869a";
  context.textAlign = "left";
  context.fillText("24h", padding.left, bounds.height - 2);
  context.textAlign = "center";
  context.fillText("12h", xFor(start + 12 * 60 * 60 * 1000), bounds.height - 2);
  context.textAlign = "right";
  context.fillText("now", bounds.width - padding.right, bounds.height - 2);
}

function updateOverviewStatus(disk) {
  const degree = "\u00B0";
  const reportedHealth = String(disk.health || "Unavailable");
  const displayHealth = reportedHealth.toUpperCase() === "PASSED" ? "Healthy" : reportedHealth;
  setOverviewText("overviewTemp", disk.temperature ?? "--");
  setOverviewText("overviewTempState", disk.temperatureState || "Unavailable");
  setOverviewText("overviewRaid", disk.raid || "RAID 1");
  setOverviewText("overviewHealth", displayHealth);
  setOverviewText("overviewHours", formatOverviewHours(disk.powerOnHours));
  overviewElement("overviewTempState").className = `state ${disk.temperatureLevel || "unknown"}`;
  overviewElement("overviewHealth").className = displayHealth === "Healthy" ? "healthy" : "";
  return disk.online && disk.temperature != null ? `${disk.temperature}${degree}C` : "Drive unavailable";
}

function updateOverviewStorage(storage) {
  const percent = Math.max(0, Math.min(100, Number(storage.usedPercent) || 0));
  const percentLabel = percent > 0 && percent < 0.1 ? "<0.1%" : `${percent.toFixed(percent % 1 ? 1 : 0)}%`;
  setOverviewText("overviewUsedPercent", percentLabel);
  setOverviewText("overviewFree", formatOverviewBytes(storage.freeBytes));
  setOverviewText("overviewTotal", formatOverviewBytes(storage.totalBytes));
  const ring = overviewElement("overviewStorageRing");
  ring.style.setProperty("--overview-storage-fill", `${percent}%`);
  ring.dataset.level = storage.spaceLevel || "unknown";
  renderOverviewFolders(storage.folders);
}

function updateOverviewHistory(history) {
  const degree = "\u00B0";
  overviewSamples = Array.isArray(history.samples) ? history.samples : [];
  setOverviewText("overviewMin", history.minimum == null ? `--${degree}` : `${history.minimum}${degree}`);
  setOverviewText("overviewAvg", history.average == null ? `--${degree}` : `${history.average}${degree}`);
  setOverviewText("overviewMax", history.maximum == null ? `--${degree}` : `${history.maximum}${degree}`);
  drawOverviewChart();
}

async function refreshOverview() {
  const endpoints = ["/api/status", "/api/storage", "/api/history"];
  const results = await Promise.allSettled(endpoints.map(async (endpoint) => {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error(`${endpoint} returned HTTP ${response.status}`);
    return response.json();
  }));

  const failures = [];
  let connectionText = "Live monitoring";

  if (results[0].status === "fulfilled") connectionText = updateOverviewStatus(results[0].value);
  else failures.push("temperature");

  if (results[1].status === "fulfilled") updateOverviewStorage(results[1].value);
  else failures.push("storage");

  if (results[2].status === "fulfilled") updateOverviewHistory(results[2].value);
  else failures.push("history");

  const online = failures.length === 0;
  overviewElement("overviewDot").className = online ? "dot" : "dot offline";
  setOverviewText("overviewConnection", online ? connectionText : `Unavailable: ${failures.join(", ")}`);
  setOverviewText("overviewError", online ? "" : `Could not load ${failures.join(", ")}.`);
  overviewElement("overviewError").className = online ? "error overview-error" : "error overview-error show";
}

window.addEventListener("resize", drawOverviewChart);
refreshOverview();
setInterval(refreshOverview, 15000);
