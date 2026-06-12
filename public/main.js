const GATEWAY_URL = "https://nt-pulse-orchestrator.onrender.com";
const workerPoolCount = document.getElementById("worker-pool");
let CONCURRENT_WORKERS = parseInt(workerPoolCount.value, 10);

workerPoolCount.addEventListener("input", (e) => {
  const min = parseInt(e.target.min, 10);
  const max = parseInt(e.target.max, 10);
  let val = parseInt(e.target.value, 10);

  if (isNaN(val)) return;

  if (val > max) {
    val = max;
    e.target.value = max;
  }
  if (val < min) {
    val = min;
    e.target.value = min;
  }

  CONCURRENT_WORKERS = val;
});

workerPoolCount.addEventListener("blur", (e) => {
  if (!e.target.value) e.target.value = CONCURRENT_WORKERS;
});

const elSpeed = document.getElementById("speed-out");
const elUnit = document.getElementById("unit-out");
const elStatus = document.getElementById("global-status");
const elTrigger = document.getElementById("trigger-btn");
const controlDiv = document.querySelector(".controls");
const elDiagToggle = document.getElementById("diag-toggle");
const elDiagPanel = document.getElementById("diag-panel");

const elDiagNode = document.getElementById("diag-node");
const elDiagGeo = document.getElementById("diag-geo");
const elDiagIsp = document.getElementById("diag-isp");
const elDiagWorkers = document.getElementById("diag-workers");

const verSpan = document.querySelector(".version");

let activeWorkers = [];
let totalBytesAccumulated = 0;
let bytesSinceLastInterval = 0;
let calculationIntervalId = null;
let testStartTime = 0;
let samplingStarted = false;

window.addEventListener("load", () => {
  fetch("./version.json")
    .then((res) => res.json())
    .then((data) => (verSpan.textContent = `v${data.version}`))
    .catch((err) => console.error(err));
});

elDiagToggle.addEventListener("click", () => {
  const isVisible = elDiagPanel.classList.toggle("visible");
  elDiagToggle.innerText = isVisible ? "Hide Diagnostics" : "Show Diagnostics";
});

elTrigger.addEventListener("click", () => {
  controlDiv.querySelector(".loader")?.remove();
  controlDiv.querySelector(".test-status")?.remove();
  controlDiv.querySelector(".ai-summary")?.remove();
  controlDiv.querySelector(".ai-loader")?.remove();

  controlDiv.insertAdjacentHTML("beforeend", '<div class="loader"></div>');
  controlDiv.insertAdjacentHTML(
    "beforeend",
    `<p class="test-status">Running Test</p>`,
  );

  executeTelemetryPipeline();
});

window.addEventListener("DOMContentLoaded", () => {
  executeTelemetryPipeline();
  if (!document.querySelector(".loader")) {
    controlDiv.insertAdjacentHTML("beforeend", `<div class="loader"></div>`);
    controlDiv.insertAdjacentHTML(
      "beforeend",
      `<p class="test-status">Running Test</p>`,
    );
  }
  if (elTrigger) {
    elTrigger.disabled = true;
    elTrigger.remove();
  }
});

async function executeTelemetryPipeline() {
  if (workerPoolCount) {
    workerPoolCount.disabled = true;
    workerPoolCount.style.cursor = "not-allowed";
  }
  resetTelemetryState();
  updateUIStatus("DISCOVERING", "Querying orchestrator routing matrix...");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const clientUuid = crypto.randomUUID();
        const clientCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        const handshakeResponse = await fetch(`${GATEWAY_URL}/discover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(clientCoordinates),
        });

        if (!handshakeResponse.ok) {
          throw new Error(
            `Orchestrator rejection: ${handshakeResponse.statusText}`,
          );
        }

        const data = await handshakeResponse.json();

        const optimalNode = data.suggestedNodes[0];
        if (!optimalNode)
          throw new Error("No edge deployment pools available online.");

        const nodeEndpoint = optimalNode.endpoint || "";

        if (!nodeEndpoint) {
          throw new Error(
            "Orchestrator returned a node without a valid endpoint.",
          );
        }

        const url = new URL(nodeEndpoint);

        const sessionAllocation = {
          id: optimalNode.id,
          host: url.hostname,
          wsPort: url.port || (url.protocol === "wss" ? 443 : 80),
          latitude: clientCoordinates.latitude,
          longitude: clientCoordinates.longitude,
          isp: data.clientIsp,
          token: data.token,
        };

        renderDiagnosticCard(sessionAllocation);

        const edgeEndpoint = `${optimalNode.endpoint}?token=${data.token}&clientId=${clientUuid}`;

        updateUIStatus(
          "CONNECTING",
          "Establishing WebSocket pipe allocation...",
        );
        initializeWorkerPool(edgeEndpoint);
      } catch (error) {
        console.error("[CRITICAL] Telemetry pipe failure:", error);
        updateUIStatus("ERROR", error.message);
        teardownTelemetryState();
      }
    },
    (geoError) => {
      console.warn(
        "[GEO] Permission denied or hardware isolated. Falling back to GET routing.",
        geoError.message,
      );
      // Fallback invocation if user rejects browser location prompt
      executeGetFallbackPipeline();
    },
  );
}

async function executeGetFallbackPipeline() {
  try {
    const clientUuid = crypto.randomUUID();
    const handshakeResponse = await fetch(
      `${GATEWAY_URL}/discover?clientId=${clientUuid}`,
    );

    if (!handshakeResponse.ok)
      throw new Error(
        `Orchestrator rejection: ${handshakeResponse.statusText}`,
      );
    const sessionAllocation = await handshakeResponse.json();

    console.log("DEBUG: Received from Orchestrator:", sessionAllocation);

    if (
      sessionAllocation.host === "localhost" ||
      sessionAllocation.host === "::1"
    ) {
      sessionAllocation.host = "127.0.0.1";
    }

    renderDiagnosticCard(sessionAllocation);
    const edgeEndpoint = `ws://${sessionAllocation.host}:${sessionAllocation.wsPort}/speedtest?token=${sessionAllocation.token}&clientId=${clientUuid}`;
    updateUIStatus("CONNECTING", "Establishing WebSocket pipe allocation...");
    initializeWorkerPool(edgeEndpoint);
  } catch (error) {
    updateUIStatus("ERROR", error.message);
    teardownTelemetryState();
  }
}

function initializeWorkerPool(endpoint) {
  let workersConnectedCount = 0;
  let workersFinishedCount = 0;

  for (let i = 0; i < CONCURRENT_WORKERS; i++) {
    const worker = new Worker("./worker.js", { type: "module" });

    worker.onerror = (err) => {
      console.error(`[CRITICAL] Worker ${i} failed to initialize/load:`, err);
      updateUIStatus(
        "ERROR",
        `Worker thread initialization failed. Check compile path.`,
      );
      teardownTelemetryState();
    };

    worker.onmessage = async (event) => {
      const message = event.data;
      elSpeed.classList.add("active");

      switch (message.type) {
        case "STATUS":
          if (message.status === "CONNECTED") {
            workersConnectedCount++;
            elDiagWorkers.innerText = `${workersConnectedCount} / ${CONCURRENT_WORKERS}`;
            if (workersConnectedCount === CONCURRENT_WORKERS) {
              updateUIStatus(
                "WARMUP",
                "Saturating congestion window scales...",
              );
              elSpeed.classList.add("active");
            }
          } else if (message.status === "SAMPLING_START") {
            if (!samplingStarted) {
              samplingStarted = true;
              testStartTime = performance.now();
              updateUIStatus("ACTIVE", "Sampling saturation parameters...");
              startThroughputCalculator();
            }
          } else if (message.status === "COMPLETE") {
            workersFinishedCount++;
            if (workersFinishedCount === CONCURRENT_WORKERS) {
              await concludeTelemetryTest();
            }
          }
          break;

        case "METRICS":
          if (samplingStarted) {
            totalBytesAccumulated += message.bytesIncrement;
            bytesSinceLastInterval += message.bytesIncrement;
          }
          break;

        case "ERROR":
          console.error(`[THREAD ERROR] Worker ${i}:`, message.message);
          updateUIStatus("ERROR", message.message);
          teardownTelemetryState();
          break;
      }
    };

    worker.postMessage({
      endpoint: endpoint,
    });

    activeWorkers.push(worker);
  }
}

function startThroughputCalculator() {
  let lastSampleTime = performance.now();

  calculationIntervalId = setInterval(() => {
    const now = performance.now();
    const durationSec = (now - lastSampleTime) / 1000;

    if (durationSec <= 0) return;

    const megabits = (bytesSinceLastInterval * 8) / (1024 * 1024);
    const currentMbps = megabits / durationSec;

    elSpeed.innerText = currentMbps.toFixed(2);

    bytesSinceLastInterval = 0;
    lastSampleTime = now;
  }, 100);
}

function concludeTelemetryTest() {
  activeWorkers.forEach((worker) => worker.terminate());
  activeWorkers = [];

  if (calculationIntervalId) {
    clearInterval(calculationIntervalId);
    calculationIntervalId = null;
  }

  const totalTimeSec = (performance.now() - testStartTime) / 1000;
  const finalMegabits = (totalBytesAccumulated * 8) / (1024 * 1024);
  const finalMbps = finalMegabits / totalTimeSec;

  elSpeed.innerText = finalMbps.toFixed(2);
  elSpeed.classList.remove("active");

  const loader = controlDiv.querySelector(".loader");
  if (loader) {
    loader.remove();
    document.querySelector(".test-status")?.remove();
  }

  if (elTrigger) {
    elTrigger.disabled = false;
    controlDiv.append(elTrigger);
  }

  if (workerPoolCount) {
    workerPoolCount.disabled = false;
    workerPoolCount.style.cursor = "pointer";
  }

  updateUIStatus("COMPLETE", "Saturate execution sequence finished cleanly.");

  const snapshotSummaryEl = document.createElement("p");
  snapshotSummaryEl.className = "ai-loader";
  controlDiv.append(snapshotSummaryEl);

  fetchSpeedSummary(finalMbps)
    .then((aiSummary) => {
      if (snapshotSummaryEl && snapshotSummaryEl.parentNode) {
        snapshotSummaryEl.classList.remove("ai-loader");
        snapshotSummaryEl.classList.add("ai-summary");
        snapshotSummaryEl.innerText = aiSummary || "";
      }
    })
    .catch((err) => {
      console.error("Failed to parse speed summary:", err);
      if (snapshotSummaryEl && snapshotSummaryEl.parentNode) {
        snapshotSummaryEl.classList.remove("ai-loader");
        snapshotSummaryEl.classList.add("ai-summary");
        snapshotSummaryEl.innerText = "";
      }
    });
}

function resetTelemetryState() {
  teardownTelemetryState();
  totalBytesAccumulated = 0;
  bytesSinceLastInterval = 0;
  samplingStarted = false;
  elSpeed.innerText = "00.00";

  if (elTrigger) {
    elTrigger.disabled = true;
    elTrigger.remove();
  }

  elDiagWorkers.innerText = `0 / ${CONCURRENT_WORKERS}`;
}

function teardownTelemetryState() {
  if (calculationIntervalId) {
    clearInterval(calculationIntervalId);
    calculationIntervalId = null;
  }

  activeWorkers.forEach((worker) => worker.terminate());
  activeWorkers = [];

  if (elTrigger) {
    elTrigger.disabled = false;
    controlDiv.append(elTrigger);
  }

  if (workerPoolCount) {
    workerPoolCount.disabled = true;
    workerPoolCount.style.cursor = "not-allowed";
  }
}

function updateUIStatus(status, textLog) {
  elStatus.innerText = `STATUS: ${status}`;
  console.log(`[STATE] ${status} - ${textLog}`);
}

function renderDiagnosticCard(alloc) {
  elDiagNode.innerText = alloc.id;
  elDiagGeo.innerText = `${alloc.latitude.toFixed(4)}, ${alloc.longitude.toFixed(4)}`;
  elDiagIsp.innerText = alloc.clientIsp;
}

async function fetchSpeedSummary(mbps) {
  const response = await fetch("/api/speed-summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mbps: mbps }),
  });

  if (!response.ok) return "";

  const data = await response.json();
  return data.summary;
}
