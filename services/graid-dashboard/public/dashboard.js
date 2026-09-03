const getElement = (id) => document.getElementById(id);

const isEmbedded = new URLSearchParams(window.location.search).has("embed");
if (isEmbedded) {
  document.body.classList.add("embed");
}

function setText(id, value) {
  getElement(id).textContent = value;
}

function formatHours(hours) {
  if (hours == null) {
    return "Unavailable";
  }

  const days = Math.floor(hours / 24);
  return `${Number(hours).toLocaleString()} h \u00B7 ${days.toLocaleString()} days`;
}

function updateTemperatureGauge(temperature, level) {
  const gauge = getElement("gauge");
  const percentage = temperature == null
    ? 0
    : Math.max(0, Math.min(100, ((temperature - 20) / 50) * 100));

  let color = "var(--normal)";
  if (level === "warm") {
    color = "var(--warm)";
  } else if (level === "danger") {
    color = "var(--danger)";
  }

  gauge.style.setProperty("--fill", `${percentage}%`);
  gauge.style.setProperty("--gauge-color", color);
}

function showConnectionError(message) {
  getElement("dot").className = "dot offline";
  setText("connection", "Dashboard disconnected");
  setText("error", message);
  getElement("error").className = "error show";
}

async function refreshDashboard() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Dashboard returned HTTP ${response.status}`);
    }

    const disk = await response.json();
    const degree = "\u00B0";

    setText("temperature", disk.temperature ?? "--");
    setText("gaugeValue", disk.temperature == null ? `--${degree}` : `${disk.temperature}${degree}`);
    setText("state", disk.temperatureState);
    setText("raid", disk.raid);
    setText("health", disk.health);
    setText("hours", formatHours(disk.powerOnHours));
    setText("operation", disk.operationalStatus || "Unknown");
    setText("model", disk.model);
    setText(
      "updated",
      new Date(disk.checkedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })
    );

    getElement("state").className = `state ${disk.temperatureLevel}`;
    getElement("health").className = disk.health === "Healthy" ? "healthy" : "";
    getElement("dot").className = disk.online ? "dot" : "dot offline";
    setText("connection", disk.online ? "Live monitoring" : "Drive unavailable");

    const shouldWarn = disk.temperature != null && disk.temperature >= 60;
    getElement("warning").className = shouldWarn
      ? "temp-warning show"
      : "temp-warning";

    updateTemperatureGauge(disk.temperature, disk.temperatureLevel);

    if (disk.error) {
      setText("error", disk.error);
      getElement("error").className = "error show";
    } else {
      getElement("error").className = "error";
    }
  } catch (error) {
    showConnectionError(error.message);
  }
}

refreshDashboard();
setInterval(refreshDashboard, 15000);
