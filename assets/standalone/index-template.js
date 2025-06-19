// Set to > 0 if the DSP is polyphonic
const FAUST_DSP_VOICES = 0;

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
const $noteStartTime = document.getElementById("note-start-time");
const $scheduleNote = document.getElementById("schedule-note");
const $playSequence = document.getElementById("play-sequence");
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
const scheduleNote = (pitch, velocity, startTimeOffsetMs = 0) => {
  if (!faustNode || audioContext.state !== "running") {
    console.warn("AudioContext not running or faustNode not available");
    return null;
  }

  const startTimeOffsetSec = startTimeOffsetMs / 1000;
  const absoluteStartTime = audioContext.currentTime + startTimeOffsetSec;
  const keyOffTime = absoluteStartTime + 0.5; // 500ms later

  const noteId = Date.now() + Math.random();
  const scheduledNote = {
    id: noteId,
    pitch,
    velocity,
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
        }, 500);
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
  }, startTimeOffsetMs + 500); // Remove from display after note duration

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
            Note ${note.pitch}, Velocity ${note.velocity} - ${timeRemainingDisplay}
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
  const startTimeMs = parseInt($noteStartTime.value);

  if (isNaN(pitch) || isNaN(velocity) || isNaN(startTimeMs)) {
    alert("Please enter valid numbers for pitch, velocity, and start time");
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

  if (startTimeMs < 0) {
    alert("Start time must be 0 or greater");
    return;
  }

  scheduleNote(pitch, velocity, startTimeMs);

  // Auto-increment start time for convenience (100ms)
  $noteStartTime.value = (startTimeMs + 100).toString();
};

$playSequence.onclick = () => {
  // Play a sample sequence with different start times (in milliseconds)
  clearAllScheduledNotes();

  const baseTimeMs = 500; // Start in 500ms
  scheduleNote(60, 100, baseTimeMs); // C4
  scheduleNote(64, 80, baseTimeMs + 250); // E4
  scheduleNote(67, 90, baseTimeMs + 500); // G4
  scheduleNote(72, 110, baseTimeMs + 750); // C5
  scheduleNote(67, 70, baseTimeMs + 1000); // G4
  scheduleNote(64, 85, baseTimeMs + 1250); // E4
  scheduleNote(60, 95, baseTimeMs + 1500); // C4
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
  if (!faustNode) {
    console.warn("faustNode not available for testing");
    return;
  }

  console.log("Testing basic playback...");
  console.log("Available methods:", {
    keyOn: !!faustNode.keyOn,
    keyOff: !!faustNode.keyOff,
    keyOnScheduled: !!faustNode.keyOnScheduled,
    keyOffScheduled: !!faustNode.keyOffScheduled,
    allNotesOff: !!faustNode.allNotesOff,
  });

  if (faustNode.keyOn) {
    faustNode.keyOn(0, 60, 100);
    setTimeout(() => {
      if (faustNode.keyOff) {
        faustNode.keyOff(0, 60, 100);
      }
    }, 1000);
  }
};

// Add test button (for debugging)
window.testBasicPlayback = testBasicPlayback;

// Update display every 50ms to show countdown with millisecond precision
setInterval(updateNotesDisplay, 50);

// Play some notes using the Faust node (original function, modified to use scheduling)
const play = (node) => {
  clearAllScheduledNotes();
  scheduleNote(60, 100, 0); // Immediate
  scheduleNote(64, 100, 1); // After 1 second
  scheduleNote(67, 100, 2); // After 2 seconds

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
})();
