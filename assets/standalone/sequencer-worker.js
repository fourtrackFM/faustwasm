/**
 * Sequencer Service Worker - Based on Chris Wilson's "A Tale of Two Clocks" and Metronome
 * Provides high-precision timing for musical sequencing
 */

let timerID = null;
let interval = 100; // Start with 100ms interval (will be adjusted)
let isRunning = false;
let tickCount = 0;
let startTime = 0;

// High-precision timing using setTimeout with message passing
function tick() {
  tickCount++;

  // Post message back to main thread with current time and stats
  postMessage({
    type: "tick",
    time: performance.now(),
    tickCount: tickCount,
    interval: interval,
    drift: performance.now() - (startTime + tickCount * interval),
  });

  // Schedule next tick if still running
  if (isRunning) {
    timerID = setTimeout(tick, interval);
  }
}

// Handle messages from main thread
self.onmessage = function (e) {
  switch (e.data.type) {
    case "start":
      console.log(
        "Sequencer worker: Starting timer with interval",
        interval,
        "ms"
      );
      if (timerID) {
        clearTimeout(timerID);
      }
      isRunning = true;
      tickCount = 0;
      startTime = performance.now();
      tick();
      break;

    case "stop":
      console.log("Sequencer worker: Stopping timer");
      isRunning = false;
      if (timerID) {
        clearTimeout(timerID);
        timerID = null;
      }
      // Send final stats
      postMessage({
        type: "stopped",
        totalTicks: tickCount,
        totalTime: performance.now() - startTime,
        averageInterval: (performance.now() - startTime) / tickCount,
      });
      break;

    case "interval":
      interval = Math.max(1, Math.min(1000, e.data.interval)); // Clamp between 1ms and 1s
      console.log("Sequencer worker: Setting interval to", interval, "ms");
      break;

    case "ping":
      // Respond to ping for latency testing
      postMessage({
        type: "pong",
        originalTime: e.data.time,
        workerTime: performance.now(),
      });
      break;

    default:
      console.log("Sequencer worker: Unknown message type", e.data.type);
  }
};

// Send ready signal
postMessage({
  type: "ready",
  workerTime: performance.now(),
});

console.log("Sequencer worker loaded and ready");
