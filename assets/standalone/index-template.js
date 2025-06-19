// Set to > 0 if the DSP is polyphonic
const FAUST_DSP_VOICES = 4; // Changed to enable polyphonic mode for better testing

// Declare faustNode as a global variable
let faustNode;

// Store scheduled notes
let scheduledNotes = [];
let scheduledTimeouts = [];

// Create audio context activation button
/** @type {HTMLButtonElement} */
const $buttonDsp = document.getElementById("button-dsp");

// Note scheduling controls
const $notePitch = document.getElementById("note-pitch");
const $noteVelocity = document.getElementById("note-velocity");
const $noteDuration = document.getElementById("note-duration");
const $noteStartTime = document.getElementById("note-start-time");
const $scheduleNote = document.getElementById("schedule-note");
const $playSequence = document.getElementById("play-sequence");
const $sequenceNoteDuration = document.getElementById("sequence-note-duration");
const $simpleSequenceSubdivision = document.getElementById(
  "simple-sequence-subdivision"
);
const $stopAll = document.getElementById("stop-all");
const $clearScheduled = document.getElementById("clear-scheduled");
const $notesList = document.getElementById("notes-list");

// Create audio context
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioContext = new AudioCtx({ latencyHint: 0.00001 });

// Activate AudioContext and Sensors on user interaction
$buttonDsp.disabled = true;
let sensorHandlersBound = false;
$buttonDsp.onclick = async () => {
  // Import the requestPermissions function
  const { requestPermissions } = await import("./create-node.js");

  // Request permission for sensors
  await requestPermissions();

  // Activate sensor listeners
  if (!sensorHandlersBound) {
    await faustNode.startSensors();
    sensorHandlersBound = true;
  }

  // Activate or suspend the AudioContext
  if (audioContext.state === "running") {
    $buttonDsp.textContent = "Suspended";
    await audioContext.suspend();
    clearAllScheduledNotes();
  } else if (audioContext.state === "suspended") {
    $buttonDsp.textContent = "Running";
    await audioContext.resume();
    // if (FAUST_DSP_VOICES) play(faustNode);
  }
};

// Schedule a note to play at a specific time
const scheduleNote = (
  pitch,
  velocity,
  startTimeOffsetMs = 0,
  durationMs = 500
) => {
  console.log(
    `scheduleNote called: pitch=${pitch}, velocity=${velocity}, offset=${startTimeOffsetMs}ms, duration=${durationMs}ms`
  );

  if (!faustNode) {
    console.error("faustNode not available!");
    return null;
  }

  if (audioContext.state !== "running") {
    console.error("AudioContext not running! State:", audioContext.state);
    return null;
  }

  console.log("AudioContext currentTime:", audioContext.currentTime);
  console.log("FaustNode available methods:", {
    keyOn: typeof faustNode.keyOn,
    keyOff: typeof faustNode.keyOff,
    keyOnScheduled: typeof faustNode.keyOnScheduled,
    keyOffScheduled: typeof faustNode.keyOffScheduled,
  });

  const startTimeOffsetSec = startTimeOffsetMs / 1000;
  const durationSec = durationMs / 1000;
  const absoluteStartTime = audioContext.currentTime + startTimeOffsetSec;
  const keyOffTime = absoluteStartTime + durationSec;

  const noteId = Date.now() + Math.random();
  const scheduledNote = {
    id: noteId,
    pitch,
    velocity,
    duration: durationMs,
    startTime: absoluteStartTime,
    scheduled: new Date(Date.now() + startTimeOffsetMs),
  }; // Try to use scheduled methods if available, otherwise fall back to setTimeout
  if (faustNode.keyOnScheduled && faustNode.keyOffScheduled) {
    // Use AudioWorklet-based scheduling for precise timing
    faustNode.keyOnScheduled(0, pitch, velocity, absoluteStartTime);
    faustNode.keyOffScheduled(0, pitch, velocity, keyOffTime);

    console.log(
      `Scheduled note ${pitch} with velocity ${velocity} at time ${absoluteStartTime}, keyOff at ${keyOffTime}`
    );
  } else {
    // Fallback to setTimeout-based scheduling
    console.log("Using setTimeout fallback for note scheduling");
    setTimeout(() => {
      if (faustNode.keyOn) {
        faustNode.keyOn(0, pitch, velocity);
        console.log(
          `Playing note ${pitch} with velocity ${velocity} at time ${audioContext.currentTime}`
        );
        setTimeout(() => {
          if (faustNode.keyOff) {
            faustNode.keyOff(0, pitch, velocity);
            console.log(
              `Stopping note ${pitch} at time ${audioContext.currentTime}`
            );
          }
        }, durationMs);
      } else {
        console.warn("faustNode.keyOn method not available");
      }
    }, startTimeOffsetMs);
  }

  scheduledNotes.push(scheduledNote);

  // Use setTimeout only for UI updates and note removal from display
  const timeoutId = setTimeout(() => {
    scheduledNotes = scheduledNotes.filter((note) => note.id !== noteId);
    updateNotesDisplay();
  }, startTimeOffsetMs + durationMs); // Remove from display after note duration

  scheduledTimeouts.push({ id: noteId, timeoutId });

  updateNotesDisplay();
  return noteId;
};

// Clear all scheduled notes
const clearAllScheduledNotes = () => {
  scheduledTimeouts.forEach(({ timeoutId }) => clearTimeout(timeoutId));
  scheduledTimeouts = [];
  scheduledNotes = [];
  updateNotesDisplay();
};

// Update the display of scheduled notes
const updateNotesDisplay = () => {
  $notesList.innerHTML = "";

  if (scheduledNotes.length === 0) {
    $notesList.innerHTML = "<p>No notes scheduled</p>";
    return;
  }

  scheduledNotes.forEach((note) => {
    const noteDiv = document.createElement("div");
    noteDiv.style.cssText =
      "margin: 5px 0; padding: 5px; background: #e8e8e8; border-radius: 3px;";
    const timeRemaining = Math.max(0, note.scheduled.getTime() - Date.now());
    const timeRemainingDisplay =
      timeRemaining > 0
        ? timeRemaining >= 1000
          ? `in ${(timeRemaining / 1000).toFixed(1)}s`
          : `in ${timeRemaining.toFixed(0)}ms`
        : "playing now";
    noteDiv.innerHTML = `
            Note ${note.pitch}, Velocity ${note.velocity}, Duration ${note.duration}ms - ${timeRemainingDisplay}
            <button onclick="cancelNote(${note.id})" style="margin-left: 10px; padding: 2px 6px; background: #f44336; color: white; border: none; border-radius: 2px; cursor: pointer;">Cancel</button>
        `;
    $notesList.appendChild(noteDiv);
  });
};

// Cancel a specific scheduled note
const cancelNote = (noteId) => {
  const timeoutIndex = scheduledTimeouts.findIndex(
    (item) => item.id === noteId
  );
  if (timeoutIndex !== -1) {
    clearTimeout(scheduledTimeouts[timeoutIndex].timeoutId);
    scheduledTimeouts.splice(timeoutIndex, 1);
  }

  scheduledNotes = scheduledNotes.filter((note) => note.id !== noteId);
  updateNotesDisplay();
};

// Make cancelNote available globally for onclick handlers
window.cancelNote = cancelNote;

// Event listeners for note scheduling controls
$scheduleNote.onclick = () => {
  const pitch = parseInt($notePitch.value);
  const velocity = parseInt($noteVelocity.value);
  const duration = parseInt($noteDuration.value);
  const startTimeMs = parseInt($noteStartTime.value);

  if (
    isNaN(pitch) ||
    isNaN(velocity) ||
    isNaN(duration) ||
    isNaN(startTimeMs)
  ) {
    alert(
      "Please enter valid numbers for pitch, velocity, duration, and start time"
    );
    return;
  }

  if (pitch < 0 || pitch > 127) {
    alert("Pitch must be between 0 and 127");
    return;
  }

  if (velocity < 0 || velocity > 127) {
    alert("Velocity must be between 0 and 127");
    return;
  }

  if (duration < 50) {
    alert("Duration must be at least 50ms");
    return;
  }

  if (startTimeMs < 0) {
    alert("Start time must be 0 or greater");
    return;
  }

  scheduleNote(pitch, velocity, startTimeMs, duration);

  // Auto-increment start time for convenience (100ms)
  $noteStartTime.value = (startTimeMs + 100).toString();
};

$playSequence.onclick = () => {
  // Play a sample sequence with different start times and configurable duration
  clearAllScheduledNotes();

  const baseTimeMs = 500; // Start in 500ms
  const sequenceDuration = parseInt($sequenceNoteDuration.value) || 200; // Get duration from UI
  const subdivision = parseInt($simpleSequenceSubdivision.value) || 4; // Get subdivision
  const tempo = 120; // Default tempo for simple sequence

  // Calculate note spacing based on subdivision
  // For quarter notes (4): 60000ms / (120 BPM * 1) = 500ms
  // For eighth notes (8): 60000ms / (120 BPM * 2) = 250ms
  // For sixteenth notes (16): 60000ms / (120 BPM * 4) = 125ms
  const subdivisionMultiplier = subdivision / 4;
  const noteSpacing = 60000 / (tempo * subdivisionMultiplier); // milliseconds between notes

  console.log(
    `Playing sequence with note duration: ${sequenceDuration}ms, subdivision: 1/${subdivision}, spacing: ${noteSpacing}ms`
  );

  // C major scale sequence with configurable duration and subdivision
  const notes = [60, 64, 67, 72, 67, 64, 60]; // C4, E4, G4, C5, G4, E4, C4

  notes.forEach((pitch, index) => {
    const velocity = 80 + Math.random() * 40; // Vary velocity between 80-120
    const startTime = baseTimeMs + noteSpacing * index;
    scheduleNote(pitch, Math.round(velocity), startTime, sequenceDuration);
  });
};

$stopAll.onclick = () => {
  if (faustNode && FAUST_DSP_VOICES > 0) {
    faustNode.allNotesOff();
  }
};

$clearScheduled.onclick = () => {
  clearAllScheduledNotes();
};

// Test basic functionality
const testBasicPlayback = () => {
  console.log("=== BASIC PLAYBACK TEST ===");

  // Check AudioContext
  console.log("AudioContext state:", audioContext.state);
  console.log("AudioContext currentTime:", audioContext.currentTime);
  console.log("AudioContext sampleRate:", audioContext.sampleRate);

  // Check faustNode
  if (!faustNode) {
    console.error("❌ faustNode not available for testing");
    return;
  }

  console.log("✅ faustNode available");
  console.log("faustNode type:", faustNode.constructor.name);
  console.log("faustNode connected:", faustNode.context === audioContext);

  // Check available methods
  const methods = {
    keyOn: !!faustNode.keyOn,
    keyOff: !!faustNode.keyOff,
    keyOnScheduled: !!faustNode.keyOnScheduled,
    keyOffScheduled: !!faustNode.keyOffScheduled,
    allNotesOff: !!faustNode.allNotesOff,
    connect: !!faustNode.connect,
    getNumInputs: !!faustNode.getNumInputs,
    getNumOutputs: !!faustNode.getNumOutputs,
  };
  console.log("Available methods:", methods);

  // Check connections
  try {
    console.log(
      "Inputs:",
      faustNode.getNumInputs ? faustNode.getNumInputs() : "unknown"
    );
    console.log(
      "Outputs:",
      faustNode.getNumOutputs ? faustNode.getNumOutputs() : "unknown"
    );
  } catch (e) {
    console.log("Error checking I/O:", e.message);
  }

  // Test immediate playback
  if (audioContext.state !== "running") {
    console.error("❌ AudioContext not running! Click 'Activate DSP' first");
    return;
  }

  console.log("🎵 Testing immediate keyOn/keyOff...");
  if (faustNode.keyOn) {
    try {
      faustNode.keyOn(0, 60, 100);
      console.log("✅ keyOn called successfully");

      setTimeout(() => {
        if (faustNode.keyOff) {
          faustNode.keyOff(0, 60, 100);
          console.log("✅ keyOff called successfully");
        }
      }, 1000);
    } catch (e) {
      console.error("❌ Error calling keyOn/keyOff:", e);
    }
  } else {
    console.error("❌ keyOn method not available");
  }

  // Test scheduled playback if available
  if (faustNode.keyOnScheduled) {
    console.log("🎵 Testing scheduled playback...");
    try {
      const startTime = audioContext.currentTime + 2;
      const endTime = startTime + 0.5;
      faustNode.keyOnScheduled(0, 64, 100, startTime);
      faustNode.keyOffScheduled(0, 64, 100, endTime);
      console.log(`✅ Scheduled note 64 at time ${startTime}`);
    } catch (e) {
      console.error("❌ Error with scheduled playback:", e);
    }
  }

  console.log("=== END BASIC PLAYBACK TEST ===");
};

// Add test button (for debugging)
window.testBasicPlayback = testBasicPlayback;

// ========== SEQUENCER SYSTEM (Based on Chris Wilson's "A Tale of Two Clocks") ==========

class PrecisionSequencer {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.worker = null;
    this.isPlaying = false;
    this.tempo = 120; // BPM
    this.subdivision = 4; // Default to quarter notes (1/4)
    this.scheduleAheadTime = 25.0; // How far ahead to schedule audio (ms)
    this.nextNoteTime = 0.0; // When the next note is due
    this.currentNote = 0; // What note is currently last scheduled
    this.lookahead = 25.0; // How frequently to call scheduling function (ms)
    this.noteLength = 0.2; // Length of note (in seconds) - made longer for better testing
    this.sequence = [60, 62, 64, 65, 67, 69, 71, 72]; // C major scale
    this.notesInQueue = []; // The notes that have been put into the web audio and may or may not have played yet

    this.initWorker();
  }

  // Method to set note duration
  setNoteDuration(durationSeconds) {
    this.noteLength = Math.max(0.05, durationSeconds); // Minimum 50ms
    console.log(`Sequencer note duration set to ${this.noteLength}s`);
  }
  // Method to set note duration from milliseconds
  setNoteDurationMs(durationMs) {
    this.setNoteDuration(durationMs / 1000);
  }

  // Method to set subdivision (1, 2, 4, 8, 16, 32)
  setSubdivision(subdivision) {
    this.subdivision = Math.max(1, subdivision);
    console.log(`Sequencer subdivision set to 1/${this.subdivision} notes`);
  }

  // Method to get the time interval between notes based on tempo and subdivision
  getSubdivisionInterval() {
    // For quarter notes (subdivision = 4): 60 / (tempo * 1) = quarter note
    // For eighth notes (subdivision = 8): 60 / (tempo * 2) = eighth note
    // For sixteenth notes (subdivision = 16): 60 / (tempo * 4) = sixteenth note
    const beatsPerMinute = this.tempo;
    const subdivisionMultiplier = this.subdivision / 4; // Normalize to quarter notes
    return 60.0 / (beatsPerMinute * subdivisionMultiplier);
  }
  initWorker() {
    try {
      this.worker = new Worker("./sequencer-worker.js");
      this.worker.onmessage = (e) => {
        switch (e.data.type) {
          case "ready":
            console.log("Sequencer worker ready, latency test...");
            this.worker.postMessage({ type: "ping", time: performance.now() });
            break;

          case "tick":
            this.scheduler();
            // Log timing drift occasionally for debugging
            if (e.data.tickCount % 100 === 0) {
              console.log(
                `Worker timing - Tick ${
                  e.data.tickCount
                }, Drift: ${e.data.drift.toFixed(2)}ms`
              );
            }
            break;

          case "pong":
            const latency = performance.now() - e.data.originalTime;
            console.log(`Worker latency: ${latency.toFixed(2)}ms`);
            break;

          case "stopped":
            console.log(
              `Worker stopped - Total ticks: ${
                e.data.totalTicks
              }, Average interval: ${e.data.averageInterval.toFixed(2)}ms`
            );
            break;
        }
      };
      this.worker.onerror = (error) => {
        console.error("Sequencer worker error:", error);
        this.fallbackToMainThread();
      };
      console.log("Sequencer worker initialized");
    } catch (error) {
      console.error("Failed to create sequencer worker:", error);
      this.fallbackToMainThread();
    }
  }

  fallbackToMainThread() {
    console.log("Falling back to main thread timing");
    this.worker = null;
    if (this.isPlaying) {
      this.scheduleMainThread();
    }
  }

  scheduleMainThread() {
    if (!this.isPlaying) return;

    this.scheduler();
    setTimeout(() => this.scheduleMainThread(), this.lookahead);
  }
  nextNote() {
    // Advance the beat number, wrap to zero
    const intervalSeconds = this.getSubdivisionInterval();
    this.nextNoteTime += intervalSeconds;

    this.currentNote = (this.currentNote + 1) % this.sequence.length;
  }

  scheduleNote(beatNumber, time) {
    // Push the note on the queue, even if we're not playing
    this.notesInQueue.push({ note: beatNumber, time: time });

    if (!faustNode) return;

    // Get the note from the sequence
    const pitch = this.sequence[beatNumber % this.sequence.length];
    const velocity = 100;

    // Schedule the note using our existing system
    if (faustNode.keyOnScheduled && faustNode.keyOffScheduled) {
      faustNode.keyOnScheduled(0, pitch, velocity, time);
      faustNode.keyOffScheduled(0, pitch, velocity, time + this.noteLength);
    } else {
      // Fallback scheduling
      const offsetMs = (time - this.audioContext.currentTime) * 1000;
      setTimeout(() => {
        if (faustNode.keyOn) {
          faustNode.keyOn(0, pitch, velocity);
          setTimeout(() => {
            if (faustNode.keyOff) {
              faustNode.keyOff(0, pitch, velocity);
            }
          }, this.noteLength * 1000);
        }
      }, Math.max(0, offsetMs));
    }

    console.log(`Scheduled sequencer note ${pitch} at time ${time}`);
  }

  scheduler() {
    // While there are notes that will need to play before the next interval,
    // schedule them and advance the pointer.
    while (
      this.nextNoteTime <
      this.audioContext.currentTime + this.scheduleAheadTime / 1000
    ) {
      this.scheduleNote(this.currentNote, this.nextNoteTime);
      this.nextNote();
    }
  }

  start() {
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.currentNote = 0;
    this.nextNoteTime = this.audioContext.currentTime;
    this.notesInQueue = [];

    if (this.worker) {
      this.worker.postMessage({ type: "interval", interval: this.lookahead });
      this.worker.postMessage({ type: "start" });
    } else {
      this.scheduleMainThread();
    }

    console.log("Sequencer started");
  }

  stop() {
    if (!this.isPlaying) return;

    this.isPlaying = false;

    if (this.worker) {
      this.worker.postMessage({ type: "stop" });
    }

    // Stop all scheduled notes
    if (faustNode && faustNode.allNotesOff) {
      faustNode.allNotesOff();
    }

    console.log("Sequencer stopped");
  }

  setTempo(bpm) {
    this.tempo = Math.max(60, Math.min(200, bpm));
    console.log(`Sequencer tempo set to ${this.tempo} BPM`);
  }

  setSequence(sequence) {
    this.sequence = sequence;
    console.log("Sequencer sequence updated:", sequence);
  }
  // Get timing stats for debugging
  getTimingStats() {
    const now = this.audioContext.currentTime;
    const upcomingNotes = this.notesInQueue.filter((note) => note.time > now);
    const playedNotes = this.notesInQueue.filter((note) => note.time <= now);
    const intervalMs = this.getSubdivisionInterval() * 1000;

    return {
      currentTime: now,
      nextNoteTime: this.nextNoteTime,
      notesInQueue: this.notesInQueue.length,
      upcomingNotes: upcomingNotes.length,
      playedNotes: playedNotes.length,
      scheduleAhead: this.scheduleAheadTime,
      tempo: this.tempo,
      subdivision: this.subdivision,
      subdivisionName: this.getSubdivisionName(),
      intervalMs: intervalMs,
    };
  }

  // Get human-readable subdivision name
  getSubdivisionName() {
    const names = {
      1: "Whole",
      2: "Half",
      4: "Quarter",
      8: "Eighth",
      16: "Sixteenth",
      32: "Thirty-Second",
    };
    return names[this.subdivision] || `1/${this.subdivision}`;
  }
}

// Create sequencer instance
let sequencer = null;

// Sequencer controls
const $sequencerTempo = document.getElementById("sequencer-tempo");
const $sequencerLookahead = document.getElementById("sequencer-lookahead");
const $sequencerNoteDuration = document.getElementById(
  "sequencer-note-duration"
);
const $sequenceSubdivision = document.getElementById("sequence-subdivision");
const $sequencerStart = document.getElementById("sequencer-start");
const $sequencerStop = document.getElementById("sequencer-stop");
const $sequencerStats = document.getElementById("sequencer-stats");
const $sequencePattern = document.getElementById("sequence-pattern");
const $sequencerStatus = document.getElementById("sequencer-status");
const $timingStats = document.getElementById("timing-stats");

// Sequence patterns
const sequencePatterns = {
  major: [60, 62, 64, 65, 67, 69, 71, 72], // C Major Scale
  minor: [60, 62, 63, 65, 67, 68, 70, 72], // C Minor Scale
  chromatic: [60, 61, 62, 63, 64, 65, 66, 67], // Chromatic
  pentatonic: [60, 62, 64, 67, 69, 72], // C Major Pentatonic
  arpeggios: [60, 64, 67, 72, 67, 64], // C Major Arpeggio
};

// Initialize sequencer when audio context is ready
const initSequencer = () => {
  if (!audioContext) {
    console.warn("AudioContext not available for sequencer");
    return;
  }

  sequencer = new PrecisionSequencer(audioContext);
  console.log("Precision sequencer initialized");

  // Bind sequencer controls
  $sequencerStart.onclick = () => {
    if (sequencer && audioContext.state === "running") {
      sequencer.start();
      $sequencerStatus.textContent = "Running";
    } else {
      console.warn("AudioContext not running or sequencer not available");
    }
  };

  $sequencerStop.onclick = () => {
    if (sequencer) {
      sequencer.stop();
      $sequencerStatus.textContent = "Stopped";
      $timingStats.textContent = "";
    }
  };

  $sequencerStats.onclick = () => {
    if (sequencer) {
      const stats = sequencer.getTimingStats();
      $timingStats.innerHTML = `
        <pre>Current Time: ${stats.currentTime.toFixed(3)}s
Next Note: ${stats.nextNoteTime.toFixed(3)}s
Queue Size: ${stats.notesInQueue}
Upcoming: ${stats.upcomingNotes}
Tempo: ${stats.tempo} BPM
Subdivision: ${stats.subdivisionName} Notes (1/${stats.subdivision})
Interval: ${stats.intervalMs.toFixed(1)}ms
Schedule Ahead: ${stats.scheduleAhead}ms</pre>
      `;
    }
  };

  $sequencerTempo.onchange = () => {
    const tempo = parseInt($sequencerTempo.value);
    if (sequencer) {
      sequencer.setTempo(tempo);
    }
  };
  $sequencerLookahead.onchange = () => {
    const lookahead = parseInt($sequencerLookahead.value);
    if (sequencer) {
      sequencer.lookahead = lookahead;
      sequencer.scheduleAheadTime = lookahead;
    }
  };
  $sequencerNoteDuration.onchange = () => {
    const durationMs = parseInt($sequencerNoteDuration.value);
    if (sequencer) {
      sequencer.setNoteDurationMs(durationMs);
    }
  };

  $sequenceSubdivision.onchange = () => {
    const subdivision = parseInt($sequenceSubdivision.value);
    if (sequencer) {
      sequencer.setSubdivision(subdivision);
    }
  };

  $sequencePattern.onchange = () => {
    const pattern = $sequencePattern.value;
    if (sequencer && sequencePatterns[pattern]) {
      sequencer.setSequence(sequencePatterns[pattern]);
    }
  };
  // Update status display every 100ms when running
  setInterval(() => {
    if (sequencer && sequencer.isPlaying) {
      const stats = sequencer.getTimingStats();
      $sequencerStatus.textContent = `Running - ${stats.tempo} BPM, ${stats.subdivisionName} Notes`;
    }
  }, 100);
};

// Update display every 50ms to show countdown with millisecond precision
setInterval(updateNotesDisplay, 50);

// Play some notes using the Faust node (original function, modified to use scheduling)
const play = (node) => {
  clearAllScheduledNotes();
  scheduleNote(60, 100, 0, 800); // Immediate, 800ms duration
  scheduleNote(64, 100, 1000, 800); // After 1 second, 800ms duration
  scheduleNote(67, 100, 2000, 800); // After 2 seconds, 800ms duration

  // Schedule all notes off after 5 seconds
  setTimeout(() => {
    if (node && node.allNotesOff) {
      node.allNotesOff();
    }
  }, 5000);

  // Repeat the sequence
  setTimeout(() => play(node), 7000);
};

// Called at load time
(async () => {
  const { createFaustNode, connectToAudioInput } = await import(
    "./create-node.js"
  );

  // Create Faust node
  const result = await createFaustNode(
    audioContext,
    "FAUST_DSP_NAME",
    FAUST_DSP_VOICES
  );
  faustNode = result.faustNode; // Assign to the global variable
  if (!faustNode) throw new Error("Faust DSP not compiled");

  // Connect the Faust node to the audio output
  faustNode.connect(audioContext.destination);

  // Connect the Faust node to the audio input
  if (faustNode.getNumInputs() > 0) {
    await connectToAudioInput(audioContext, null, faustNode, null);
  }

  // Create Faust node activation button
  $buttonDsp.disabled = false;

  // Set page title to the DSP name
  document.title = name;

  // Initialize notes display
  updateNotesDisplay();
  // Initialize sequencer
  initSequencer();

  // Add global test functions for debugging
  window.sequencer = sequencer;
  window.testTiming = () => {
    console.log("=== TIMING TEST ===");
    const startTime = performance.now();
    const audioStartTime = audioContext.currentTime;

    console.log("Performance.now():", startTime);
    console.log("AudioContext.currentTime:", audioStartTime);
    console.log("Date.now():", Date.now());

    if (sequencer) {
      console.log("Sequencer stats:", sequencer.getTimingStats());
    }

    if (faustNode) {
      console.log("FaustNode methods available:", {
        keyOn: !!faustNode.keyOn,
        keyOff: !!faustNode.keyOff,
        keyOnScheduled: !!faustNode.keyOnScheduled,
        keyOffScheduled: !!faustNode.keyOffScheduled,
        allNotesOff: !!faustNode.allNotesOff,
      });
    }

    console.log("=== END TIMING TEST ===");
  };

  console.log("Faust template loaded. Available test functions:");
  console.log("- testBasicPlayback() - Test basic note playback");
  console.log("- testTiming() - Show timing information");
  console.log("- sequencer - Access sequencer instance");
})();
