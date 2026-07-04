import { useEffect, useRef, useState } from "react";
import { useRive } from "@rive-app/react-canvas";

const src = new URL("../../../assets/avatar.riv", import.meta.url).href;

export default function AvatarPanel({
  conversationState,
  spokenText,
  isSpeaking,
  amplitudeRef,
  currentTimeRef,
  width = 300,
  height = 400,
  showGlow = true,
  showDebugLabel = false,
  showWordHighlight = false
}) {
  const { rive, RiveComponent } = useRive({
    src,
    autoplay: true
  });
  const [visualAmplitude, setVisualAmplitude] = useState(0);
  const [currentWord, setCurrentWord] = useState("");
  const spokenWordsRef = useRef([]);

  useEffect(() => {
    spokenWordsRef.current = (spokenText || "").split(/\s+/).filter(Boolean);
  }, [spokenText]);

  useEffect(() => {
    let frame = 0;

    const tick = () => {
      setVisualAmplitude(amplitudeRef?.current || 0);

      if (isSpeaking && spokenText) {
        const wordsPerSecond = 2.2;
        const words = spokenWordsRef.current;
        const wordIndex = Math.min(words.length - 1, Math.floor((currentTimeRef?.current || 0) * wordsPerSecond));
        setCurrentWord(words[wordIndex] || "");
      } else {
        setCurrentWord("");
      }

      frame = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [amplitudeRef, currentTimeRef, isSpeaking, spokenText]);

  useEffect(() => {
    if (!rive) return;

    const animationMap = {
      idle: "idle",
      listening: "Listening",
      thinking: "idle",
      speaking: "Speaking",
      react_positive: "Speaking",
      react_negative: "idle"
    };

    const animationName = animationMap[isSpeaking ? "speaking" : conversationState] || "idle";

    try {
      rive.stop();
      rive.play(animationName);
    } catch (_error) {
      // Silently fall back if the requested animation is unavailable.
    }
  }, [conversationState, isSpeaking, rive]);

  const glowMap = {
    idle: "0 0 24px 4px rgba(150,150,150,0.4)",
    listening: "0 0 24px 4px rgba(59,130,246,0.6)",
    thinking: "0 0 24px 4px rgba(234,179,8,0.6)",
    speaking: "0 0 24px 4px rgba(34,197,94,0.6)",
    react_positive: "0 0 24px 4px rgba(34,197,94,0.8)",
    react_negative: "0 0 24px 4px rgba(239,68,68,0.6)"
  };
  const textColorMap = {
    idle: "#6B7280",
    listening: "#3B82F6",
    thinking: "#EAB308",
    speaking: "#22C55E",
    react_positive: "#16A34A",
    react_negative: "#EF4444"
  };

  const glowColor = showGlow ? glowMap[conversationState] ?? glowMap.idle : "none";
  const currentTextColor = textColorMap[conversationState] ?? textColorMap.idle;

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          width,
          height,
          borderRadius: 16,
          boxShadow: glowColor,
          transition: "box-shadow 0.4s ease",
          overflow: "hidden",
          background: "#ffffff"
        }}
      >
        <RiveComponent />
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: Math.max(28, Math.round(height * 0.15)),
            width: `${18 + visualAmplitude * 30}px`,
            height: `${18 + visualAmplitude * 30}px`,
            transform: "translateX(-50%)",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.2)",
            boxShadow: showGlow ? glowColor : "none",
            transition: "width 0.08s linear, height 0.08s linear, box-shadow 0.2s ease"
          }}
        />
      </div>
      {showDebugLabel ? (
        <div style={{ color: "#aaa", fontSize: 12, textAlign: "center" }}>{conversationState}</div>
      ) : null}
      {showWordHighlight ? (
        <div
          style={{
            position: "relative",
            textAlign: "center",
            marginTop: 8,
            fontSize: 18,
            fontWeight: "bold",
            color: currentTextColor,
            minHeight: 28
          }}
        >
          {currentWord}
        </div>
      ) : null}
    </div>
  );
}
