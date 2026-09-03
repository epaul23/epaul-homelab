const historyElement = (id) => document.getElementById(id);

if (new URLSearchParams(window.location.search).has("embed")) {
  document.body.classList.add("embed");
}

let historySamples = [];

function setHistoryText(id, value) {
  historyElement(id).textContent = value;
}

function drawHistoryChart() {
  const canvas = historyElement("temperatureChart");
  const context = canvas.getContext("2d");
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.max(1, Math.round(bounds.width * ratio));
  canvas.height = Math.max(1, Math.round(bounds.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);

  if (historySamples.length < 2) {
    historyElement("historyEmpty").classList.add("show");
    return;
  }

  historyElement("historyEmpty").classList.remove("show");

  const temperatures = historySamples.map((sample) => sample.temperature);
  const timestamps = historySamples.map((sample) => new Date(sample.timestamp).getTime());
  const now = Date.now();
  const start = now - (24 * 60 * 60 * 1000);
  const minimumY = Math.min(40, Math.floor(Math.min(...temperatures) - 2));
  const maximumY = Math.max(62, Math.ceil(Math.max(...temperatures) + 2));
  const padding = { top: 8, right: 8, bottom: 18, left: 28 };
  const chartWidth = bounds.width - padding.left - padding.right;
  const chartHeight = bounds.height - padding.top - padding.bottom;

  const xFor = (timestamp) => padding.left + ((timestamp - start) / (now - start)) * chartWidth;
  const yFor = (temperature) => padding.top + ((maximumY - temperature) / (maximumY - minimumY)) * chartHeight;

  context.font = "10px system-ui";
  context.fillStyle = "#73869a";
  context.strokeStyle = "rgba(142,160,179,.16)";
  context.lineWidth = 1;

  [minimumY, Math.round((minimumY + maximumY) / 2), maximumY].forEach((value) => {
    const y = yFor(value);
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(bounds.width - padding.right, y);
    context.stroke();
    context.fillText(`${value}\u00B0`, 2, y + 3);
  });

  const warningY = yFor(60);
  context.save();
  context.setLineDash([5, 5]);
  context.strokeStyle = "rgba(255,101,122,.7)";
  context.beginPath();
  context.moveTo(padding.left, warningY);
  context.lineTo(bounds.width - padding.right, warningY);
  context.stroke();
  context.restore();

  const gradient = context.createLinearGradient(0, padding.top, 0, bounds.height - padding.bottom);
  gradient.addColorStop(0, "rgba(255,186,82,.28)");
  gradient.addColorStop(1, "rgba(102,183,255,0)");

  context.beginPath();
  historySamples.forEach((sample, index) => {
    const x = xFor(timestamps[index]);
    const y = yFor(sample.temperature);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.lineTo(xFor(timestamps[timestamps.length - 1]), bounds.height - padding.bottom);
  context.lineTo(xFor(timestamps[0]), bounds.height - padding.bottom);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  historySamples.forEach((sample, index) => {
    const x = xFor(timestamps[index]);
    const y = yFor(sample.temperature);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = "#66b7ff";
  context.lineWidth = 2;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();

  context.fillStyle = "#73869a";
  context.textAlign = "left";
  context.fillText("24h ago", padding.left, bounds.height - 3);
  context.textAlign = "center";
  context.fillText("12h", padding.left + chartWidth / 2, bounds.height - 3);
  context.textAlign = "right";
  context.fillText("now", bounds.width - padding.right, bounds.height - 3);
}

async function refreshHistory() {
  try {
    const response = await fetch("/api/history", { cache: "no-store" });
    if (!response.ok) throw new Error(`History returned HTTP ${response.status}`);

    const history = await response.json();
    historySamples = Array.isArray(history.samples) ? history.samples : [];
    const degree = "\u00B0";

    setHistoryText("historyMin", history.minimum == null ? `--${degree}` : `${history.minimum}${degree}`);
    setHistoryText("historyAvg", history.average == null ? `--${degree}` : `${history.average}${degree}`);
    setHistoryText("historyMax", history.maximum == null ? `--${degree}` : `${history.maximum}${degree}`);
    setHistoryText("historyStatus", historySamples.length < 2 ? "Collecting readings" : `${historySamples.length} readings`);
    historyElement("historyDot").className = "dot";
    historyElement("historyError").className = "error";
    drawHistoryChart();
  } catch (error) {
    historyElement("historyDot").className = "dot offline";
    setHistoryText("historyStatus", "History unavailable");
    setHistoryText("historyError", error.message);
    historyElement("historyError").className = "error show";
  }
}

window.addEventListener("resize", drawHistoryChart);
refreshHistory();
setInterval(refreshHistory, 60000);

