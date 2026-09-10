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

function updateOverviewStatus(disk) {
  const degree = "\u00B0";
  setOverviewText("overviewTemp", disk.temperature ?? "--");
  setOverviewText("overviewTempState", disk.temperatureState || "Unavailable");
  setOverviewText("overviewRaid", disk.raid || "RAID 1");
  setOverviewText("overviewHealth", disk.health || "Unavailable");
  setOverviewText("overviewHours", formatOverviewHours(disk.powerOnHours));
  overviewElement("overviewTempState").className = `state ${disk.temperatureLevel || "unknown"}`;
  overviewElement("overviewHealth").className = disk.health === "Healthy" ? "healthy" : "";
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
setInterval(refreshOverview, 30000);

/* Polished temperature trend — overrides the original chart only */
function drawOverviewChart() {
  const canvas = overviewElement("overviewChart");
  const ctx = canvas.getContext("2d");
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.max(1, Math.round(box.width * ratio));
  canvas.height = Math.max(1, Math.round(box.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);

  const now = Date.now();
  const start = now - (24 * 60 * 60 * 1000);

  const samples = overviewSamples
    .map(sample => ({
      temp: Number(sample.temperature),
      time: new Date(sample.timestamp).getTime()
    }))
    .filter(sample =>
      Number.isFinite(sample.temp) &&
      Number.isFinite(sample.time) &&
      sample.time >= start
    )
    .sort((a, b) => a.time - b.time);

  if (samples.length < 2) {
    overviewElement("overviewChartEmpty").classList.add("show");
    return;
  }

  overviewElement("overviewChartEmpty").classList.remove("show");

  const temperatures = samples.map(sample => sample.temp);
  const lowest = Math.min(...temperatures);
  const highest = Math.max(...temperatures);
  const center = (lowest + highest) / 2;
  const range = Math.max(6, highest - lowest + 4);

  const minY = Math.floor(center - range / 2);
  const maxY = Math.ceil(center + range / 2);

  const padding = {
    top: 8,
    right: 9,
    bottom: 16,
    left: 28
  };

  const width = box.width - padding.left - padding.right;
  const height = box.height - padding.top - padding.bottom;

  const getX = time =>
    padding.left + ((time - start) / (now - start)) * width;

  const getY = temp =>
    padding.top + ((maxY - temp) / (maxY - minY)) * height;

  const points = samples.map(sample => ({
    x: getX(sample.time),
    y: getY(sample.temp)
  }));

  function drawSmoothPath() {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length - 1; i++) {
      const middleX = (points[i].x + points[i + 1].x) / 2;
      const middleY = (points[i].y + points[i + 1].y) / 2;

      ctx.quadraticCurveTo(
        points[i].x,
        points[i].y,
        middleX,
        middleY
      );
    }

    const previous = points[points.length - 2];
    const last = points[points.length - 1];

    ctx.quadraticCurveTo(previous.x, previous.y, last.x, last.y);
  }

  ctx.font = "8px system-ui";
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(142,160,179,.12)";
  ctx.fillStyle = "#73869a";

  [minY, (minY + maxY) / 2, maxY].forEach(value => {
    const y = getY(value);

    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(box.width - padding.right, y);
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(value)}°`, padding.left - 4, y + 3);
  });

  [start, start + (12 * 60 * 60 * 1000), now].forEach(time => {
    const x = getX(time);

    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, box.height - padding.bottom);
    ctx.stroke();
  });

  const gradient = ctx.createLinearGradient(
    0,
    padding.top,
    0,
    box.height - padding.bottom
  );

  gradient.addColorStop(0, "rgba(102,183,255,.40)");
  gradient.addColorStop(0.65, "rgba(102,183,255,.10)");
  gradient.addColorStop(1, "rgba(102,183,255,0)");

  drawSmoothPath();
  ctx.lineTo(points[points.length - 1].x, box.height - padding.bottom);
  ctx.lineTo(points[0].x, box.height - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  drawSmoothPath();
  ctx.strokeStyle = "rgba(102,183,255,.22)";
  ctx.lineWidth = 7;
  ctx.stroke();

  drawSmoothPath();
  ctx.strokeStyle = "#66b7ff";
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  const latest = points[points.length - 1];

  ctx.beginPath();
  ctx.arc(latest.x, latest.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(102,183,255,.22)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(latest.x, latest.y, 2.3, 0, Math.PI * 2);
  ctx.fillStyle = "#b5deff";
  ctx.fill();

  ctx.fillStyle = "#73869a";

  ctx.textAlign = "left";
  ctx.fillText("24h", padding.left, box.height - 2);

  ctx.textAlign = "center";
  ctx.fillText("12h", getX(start + (12 * 60 * 60 * 1000)), box.height - 2);

  ctx.textAlign = "right";
  ctx.fillText("now", box.width - padding.right, box.height - 2);
}
