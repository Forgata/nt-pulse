export async function executeTelemetryPipeline() {
  resetTelemetryState();
  updateUIStatus("DISCOVERING", "Querying orchestrator routing matrix...");

  try {
    const clientUuid = crypto.randomUUID();
    const handshakeResponse = await fetch(
      `${GATEWAY_URL}/discover?clientId=${clientUuid}`,
    );

    if (!handshakeResponse.ok) {
      throw new Error(
        `Orchestrator rejection: ${handshakeResponse.statusText}`,
      );
    }

    const sessionAllocation = await handshakeResponse.json();

    if (
      sessionAllocation.host === "localhost" ||
      sessionAllocation.host === "::1"
    ) {
      sessionAllocation.host = "127.0.0.1";
    }

    renderDiagnosticCard(sessionAllocation);

    const edgeEndpoint = `ws://${sessionAllocation.host}:${sessionAllocation.wsPort}/speedtest?token=${sessionAllocation.token}&clientId=${clientUuid}`;

    updateUIStatus(
      "CONNECTING",
      "Establishing Secure WebSocket pipe allocation...",
    );
    initializeWorkerPool(edgeEndpoint);
  } catch (error) {
    console.error("[CRITICAL] Telemetry pipe failure:", error);
    updateUIStatus("ERROR", error.message);
    teardownTelemetryState();
  }
}

export function teardownTelemetryState() {
  if (calculationIntervalId) {
    clearInterval(calculationIntervalId);
    calculationIntervalId = null;
  }

  activeWorkers.forEach((worker) => worker.terminate());
  activeWorkers = [];

  elTrigger.disabled = false;
}

export function concludeTelemetryTest() {
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
  elTrigger.disabled = false;

  updateUIStatus("COMPLETE", "Saturate execution sequence finished cleanly.");
}

export function resetTelemetryState() {
  teardownTelemetryState();
  totalBytesAccumulated = 0;
  bytesSinceLastInterval = 0;
  samplingStarted = false;
  elSpeed.innerText = "00.00";
  elTrigger.disabled = true;

  elDiagWorkers.innerText = `0 / ${CONCURRENT_WORKERS}`;
}

// module.exports = {
//   executeTelemetryPipeline,
//   resetTelemetryState,
//   concludeTelemetryTest,
//   teardownTelemetryState,
// };
