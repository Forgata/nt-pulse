interface WorkerInitPayload {
  endpoint: string;
}

self.onmessage = (event: MessageEvent<WorkerInitPayload>) => {
  const { endpoint } = event.data;

  console.log(
    `[WORKER] Instantiating Secure WebSocket connection to: ${endpoint}`,
  );

  let socket: WebSocket;
  try {
    socket = new WebSocket(endpoint);
    socket.binaryType = "arraybuffer";
  } catch (error: any) {
    self.postMessage({
      type: "ERROR",
      message: `WebSocket initialization failed: ${error.message}`,
    });
    return;
  }

  let totalBytesSampled = 0;
  let isSamplingActive = false;
  let isTestRunning = true;

  socket.onopen = () => {
    self.postMessage({ type: "STATUS", status: "CONNECTED" });

    setTimeout(() => {
      if (!isTestRunning) return;
      isSamplingActive = true;
      self.postMessage({ type: "STATUS", status: "SAMPLING_START" });

      setTimeout(() => {
        isTestRunning = false;
        isSamplingActive = false;

        try {
          socket.close();
        } catch {}

        self.postMessage({
          type: "STATUS",
          status: "COMPLETE",
          totalBytes: totalBytesSampled,
        });
      }, 5000);
    }, 2000);
  };

  socket.onmessage = (messageEvent: MessageEvent) => {
    if (!isTestRunning) return;

    const chunkLength = (messageEvent.data as ArrayBuffer).byteLength;

    if (isSamplingActive) {
      totalBytesSampled += chunkLength;

      self.postMessage({
        type: "METRICS",
        bytesIncrement: chunkLength,
      });
    }
  };

  socket.onerror = () => {
    if (isTestRunning) {
      self.postMessage({
        type: "ERROR",
        message: "WebSocket connection experienced a TCP/TLS transport error.",
      });
      isTestRunning = false;
    }
  };

  socket.onclose = () => {
    isTestRunning = false;
  };
};
