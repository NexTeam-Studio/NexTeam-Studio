const ELEVENLABS_VOICE_ID = "YYINOwVpecHUim8ReMlk";
const ELEVENLABS_STREAM_URL = `/elevenlabs/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`;

let audioContext = null;
let analyserNode = null;
let audioElement = null;
let mediaElementSource = null;
let amplitudeFrame = null;
let objectUrl = null;

export function setAudioContext(context) {
  audioContext = context;
}

function stripMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/`{1,3}(.*?)`{1,3}/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[-*+]\s/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

function cleanupAudioGraph() {
  if (amplitudeFrame) {
    cancelAnimationFrame(amplitudeFrame);
    amplitudeFrame = null;
  }

  if (mediaElementSource) {
    mediaElementSource.disconnect();
    mediaElementSource = null;
  }

  if (analyserNode) {
    analyserNode.disconnect();
    analyserNode = null;
  }

  if (audioElement) {
    audioElement.pause();
    audioElement.src = "";
    audioElement.load();
    audioElement = null;
  }

  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function startAmplitudeLoop(onAmplitude, onTimeUpdate) {
  if (!analyserNode) {
    return;
  }

  const data = new Uint8Array(analyserNode.frequencyBinCount);

  const tick = () => {
    if (!analyserNode) {
      return;
    }

    analyserNode.getByteFrequencyData(data);
    const total = data.reduce((sum, value) => sum + value, 0);
    const average = data.length ? total / data.length / 255 : 0;
    onAmplitude(average);
    if (audioElement && onTimeUpdate) {
      onTimeUpdate(audioElement.currentTime || 0);
    }
    amplitudeFrame = requestAnimationFrame(tick);
  };

  tick();
}

export async function stopSpeaking() {
  cleanupAudioGraph();

  if (audioContext && audioContext.state === "running") {
    await audioContext.suspend();
  }
}

export async function speakText(text, onAmplitude, onDone, onTimeUpdate) {
  await stopSpeaking();

  const response = await fetch(ELEVENLABS_STREAM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: stripMarkdown(text),
      model_id: "eleven_turbo_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 0.95 }
    })
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    console.warn("[ElevenLabs] TTS failed:", response.status, errorBody?.detail?.message);
    onAmplitude(0);
    if (onDone) onDone();
    return;
  }

  if (!response.body) {
    console.warn("[ElevenLabs] TTS failed:", "no_stream_body");
    onAmplitude(0);
    if (onDone) onDone();
    return;
  }

  if (!audioContext || audioContext.state === "closed") {
    audioContext = new window.AudioContext();
  }

  await audioContext.resume();

  const reader = response.body.getReader();
  const chunks = [];

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    if (value && value.byteLength) {
      chunks.push(value);
    }
  }

  const audioBlob = new Blob(chunks, { type: "audio/mpeg" });
  objectUrl = URL.createObjectURL(audioBlob);

  audioElement = new Audio(objectUrl);
  audioElement.autoplay = true;
  audioElement.crossOrigin = "anonymous";
  audioElement.volume = 1;

  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 256;
  mediaElementSource = audioContext.createMediaElementSource(audioElement);
  mediaElementSource.connect(analyserNode);
  analyserNode.connect(audioContext.destination);

  const donePromise = new Promise((resolve) => {
    const finalize = () => {
      onAmplitude(0);
      if (onTimeUpdate) {
        onTimeUpdate(0);
      }
      resolve();
    };

    audioElement.addEventListener("ended", finalize, { once: true });
    audioElement.addEventListener("error", finalize, { once: true });
  });

  startAmplitudeLoop(onAmplitude, onTimeUpdate);

  await audioElement.play();

  await donePromise;
  await stopSpeaking();
  onDone();
}
