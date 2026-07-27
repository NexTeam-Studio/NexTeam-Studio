import React, { useEffect, useMemo, useRef } from "react";

export interface SignatureCaptureValue {
  mode: "drawn" | "typed";
  typedName: string;
  drawnDataUrl: string;
}

export function blankSignatureCaptureValue(
  typedName = ""
): SignatureCaptureValue {
  return {
    mode: "drawn",
    typedName,
    drawnDataUrl: ""
  };
}

export function NexOpsSignatureCapture(props: {
  value: SignatureCaptureValue;
  disabled?: boolean;
  typedPlaceholder?: string;
  onChange: (next: SignatureCaptureValue) => void;
}): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerActiveRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const syncPendingRef = useRef<number | null>(null);
  const signedLabel = useMemo(
    () => props.value.typedName.trim() || "Customer signature",
    [props.value.typedName]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = 720;
    const height = 180;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.4;
    context.strokeStyle = "#0a3d57";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    if (!props.value.drawnDataUrl) {
      return;
    }
    const image = new Image();
    image.onload = () => {
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
    };
    image.src = props.value.drawnDataUrl;
  }, [props.value.drawnDataUrl]);

  useEffect(() => {
    return () => {
      if (syncPendingRef.current !== null) {
        window.cancelAnimationFrame(syncPendingRef.current);
      }
    };
  }, []);

  function queueSync(): void {
    if (syncPendingRef.current !== null) {
      window.cancelAnimationFrame(syncPendingRef.current);
    }
    syncPendingRef.current = window.requestAnimationFrame(() => {
      syncPendingRef.current = null;
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      props.onChange({
        ...props.value,
        drawnDataUrl: canvas.toDataURL("image/png")
      });
    });
  }

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>): {
    x: number;
    y: number;
  } {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 720,
      y: ((event.clientY - rect.top) / rect.height) * 180
    };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (props.disabled) {
      return;
    }
    pointerActiveRef.current = true;
    const nextPoint = pointFromEvent(event);
    lastPointRef.current = nextPoint;
    const context = canvasRef.current?.getContext("2d");
    if (!context) {
      return;
    }
    context.beginPath();
    context.moveTo(nextPoint.x, nextPoint.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();
    queueSync();
  }

  function continueDrawing(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!pointerActiveRef.current || props.disabled) {
      return;
    }
    const nextPoint = pointFromEvent(event);
    const lastPoint = lastPointRef.current;
    const context = canvasRef.current?.getContext("2d");
    if (!context || !lastPoint) {
      return;
    }
    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();
    lastPointRef.current = nextPoint;
    queueSync();
  }

  function stopDrawing(): void {
    pointerActiveRef.current = false;
    lastPointRef.current = null;
  }

  function clearDrawnSignature(): void {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 720, 180);
    props.onChange({
      ...props.value,
      drawnDataUrl: ""
    });
  }

  return (
    <div className="nexops-signature-shell">
      <div className="nexops-signature-tabs" role="tablist" aria-label="Signature mode">
        <button
          type="button"
          className={props.value.mode === "drawn" ? "active" : ""}
          disabled={props.disabled}
          aria-pressed={props.value.mode === "drawn"}
          onClick={() => props.onChange({ ...props.value, mode: "drawn" })}
        >
          Draw signature
        </button>
        <button
          type="button"
          className={props.value.mode === "typed" ? "active" : ""}
          disabled={props.disabled}
          aria-pressed={props.value.mode === "typed"}
          onClick={() => props.onChange({ ...props.value, mode: "typed" })}
        >
          Type signature
        </button>
      </div>

      {props.value.mode === "drawn" ? (
        <div className="nexops-signature-drawn">
          <canvas
            ref={canvasRef}
            className="nexops-signature-canvas"
            onPointerDown={startDrawing}
            onPointerMove={continueDrawing}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
            aria-label="Draw signature"
          />
          <div className="nexops-inline-actions">
            <button
              type="button"
              className="nexops-link-button"
              disabled={props.disabled}
              onClick={clearDrawnSignature}
            >
              Clear signature
            </button>
            <small>{props.value.drawnDataUrl ? "Drawn signature captured." : "Customer can sign directly on the device."}</small>
          </div>
        </div>
      ) : (
        <label className="nexops-field">
          <span>Typed signature</span>
          <input
            value={props.value.typedName}
            disabled={props.disabled}
            placeholder={props.typedPlaceholder ?? "Type the signer name"}
            onChange={(event) => props.onChange({
              ...props.value,
              typedName: event.target.value
            })}
          />
          <small>{signedLabel}</small>
        </label>
      )}
    </div>
  );
}
