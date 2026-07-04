import { useCallback, useRef, useState } from "react";
import { setAudioContext, speakText, stopSpeaking } from "../services/elevenLabsService";

const WORDS_PER_SECOND = 2.2;
const SENTENCE_GAP_MS = 150;
let unlockedAudioContext = null;

function splitIntoSentences(text) {
  const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return (parts || []).map((part) => part.trim()).filter(Boolean);
}

export function unlockAudio() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!unlockedAudioContext || unlockedAudioContext.state === "closed") {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    unlockedAudioContext = new AudioContextClass();
  }

  void unlockedAudioContext.resume();
  setAudioContext(unlockedAudioContext);
  return unlockedAudioContext;
}

export function useElevenLabs() {
  const amplitudeRef = useRef(0);
  const currentTimeRef = useRef(0);
  const pendingQueueRef = useRef([]);
  const bufferRef = useRef("");
  const processingRef = useRef(false);
  const elapsedOffsetRef = useRef(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const processQueue = useCallback(async () => {
    if (processingRef.current) {
      return;
    }

    processingRef.current = true;

    try {
      while (pendingQueueRef.current.length) {
        const sentence = pendingQueueRef.current.shift();

        if (!sentence) {
          continue;
        }

        setIsSpeaking(true);
        amplitudeRef.current = 0;

        const sentenceWordCount = sentence.split(/\s+/).filter(Boolean).length;
        const sentenceOffset = elapsedOffsetRef.current;

        await speakText(
          sentence,
          (amplitude) => {
            amplitudeRef.current = amplitude;
          },
          () => {
            amplitudeRef.current = 0;
          },
          (currentTime) => {
            currentTimeRef.current = sentenceOffset + currentTime;
          }
        );

        elapsedOffsetRef.current = sentenceOffset + sentenceWordCount / WORDS_PER_SECOND;
        currentTimeRef.current = elapsedOffsetRef.current;
        await new Promise((resolve) => setTimeout(resolve, SENTENCE_GAP_MS));
        elapsedOffsetRef.current += SENTENCE_GAP_MS / 1000;
      }
    } catch (_err) {
      amplitudeRef.current = 0;
      currentTimeRef.current = 0;
    } finally {
      processingRef.current = false;
      amplitudeRef.current = 0;
      currentTimeRef.current = 0;
      setIsSpeaking(false);
    }
  }, []);

  const pushChunk = useCallback(
    (chunk) => {
      if (!chunk) {
        return;
      }

      bufferRef.current += chunk;
      const sentences = splitIntoSentences(bufferRef.current);

      if (/[.!?]\s*$/.test(bufferRef.current)) {
        pendingQueueRef.current.push(...sentences);
        bufferRef.current = "";
      } else if (sentences.length > 1) {
        pendingQueueRef.current.push(...sentences.slice(0, -1));
        bufferRef.current = sentences[sentences.length - 1];
      }

      void processQueue();
    },
    [processQueue]
  );

  const flushBuffer = useCallback(async () => {
    if (bufferRef.current.trim()) {
      pendingQueueRef.current.push(bufferRef.current.trim());
      bufferRef.current = "";
    }

    await processQueue();
  }, [processQueue]);

  const speak = useCallback(
    async (text) => {
      if (!text) {
        return;
      }

      pendingQueueRef.current = [];
      bufferRef.current = "";
      elapsedOffsetRef.current = 0;
      currentTimeRef.current = 0;
      amplitudeRef.current = 0;

      splitIntoSentences(text).forEach((sentence) => {
        pendingQueueRef.current.push(sentence);
      });

      await processQueue();
    },
    [processQueue]
  );

  const stop = useCallback(async () => {
    pendingQueueRef.current = [];
    bufferRef.current = "";
    elapsedOffsetRef.current = 0;
    amplitudeRef.current = 0;
    currentTimeRef.current = 0;
    setIsSpeaking(false);
    await stopSpeaking();
  }, []);

  const speakGreeting = useCallback(
    async (text) => {
      await speak(text);
    },
    [speak]
  );

  return { speak, speakGreeting, stop, isSpeaking, amplitudeRef, currentTimeRef, pushChunk, flushBuffer };
}
