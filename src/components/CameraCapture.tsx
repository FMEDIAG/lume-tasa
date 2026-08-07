import { useEffect, useRef, useState } from "react";
import { X, Check, Focus, Zap, ZapOff } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
  t: Record<string, any>;
}

const ZOOM_LEVELS = [1, 2, 3, 5] as const;
type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export function CameraCapture({ onCapture, onClose, t }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [zoom, setZoom] = useState<ZoomLevel>(1);
  const [digitalZoom, setDigitalZoom] = useState(1);
  const [macro, setMacro] = useState(false);
  const [torch, setTorch] = useState(false);
  const [supportsTorch, setSupportsTorch] = useState(false);
  const [supportsFocus, setSupportsFocus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          /* autoplay handled by attributes */
        }
        setIsStreaming(true);
      }

      const track = stream.getVideoTracks()[0];
      const caps: any = (track as any)?.getCapabilities?.() ?? {};
      setSupportsTorch(Boolean(caps.torch));
      setSupportsFocus(
        Array.isArray(caps.focusMode) ? caps.focusMode.includes("manual") : Boolean(caps.focusDistance)
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo acceder a la cámara / Could not access camera"
      );
    }
  }

  async function applyZoom(level: ZoomLevel) {
    setZoom(level);
    const track = streamRef.current?.getVideoTracks()[0];
    const caps: any = (track as any)?.getCapabilities?.() ?? {};

    if (track && caps.zoom) {
      const hw = Math.min(Math.max(level, caps.zoom.min ?? 1), caps.zoom.max ?? 1);
      try {
        await (track as any).applyConstraints({ advanced: [{ zoom: hw }] });
        const remaining = level / hw;
        setDigitalZoom(remaining);
        return;
      } catch {
        /* fall through to digital zoom */
      }
    }
    setDigitalZoom(level);
  }

  async function toggleMacro() {
    const next = !macro;
    setMacro(next);
    const track = streamRef.current?.getVideoTracks()[0];
    const caps: any = (track as any)?.getCapabilities?.() ?? {};

    if (track && supportsFocus) {
      try {
        if (next) {
          const near = caps.focusDistance?.min ?? 0;
          await (track as any).applyConstraints({
            advanced: [{ focusMode: "manual", focusDistance: near }],
          });
        } else {
          await (track as any).applyConstraints({ advanced: [{ focusMode: "continuous" }] });
        }
      } catch {
        /* keep digital macro assist */
      }
    }
    // Macro assist: acerca la imagen para resolver detalle fino (punzones, cuños...)
    if (next && zoom < 2) await applyZoom(2);
    if (!next) await applyZoom(1);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !supportsTorch) return;
    const next = !torch;
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: next }] });
      setTorch(next);
    } catch {
      /* ignore */
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const z = digitalZoom;
    // Recorte central según el zoom digital aplicado en pantalla
    const srcW = video.videoWidth / z;
    const srcH = video.videoHeight / z;
    const srcX = (video.videoWidth - srcW) / 2;
    const srcY = (video.videoHeight - srcH) / 2;

    // En macro conservamos más resolución para no perder detalle fino
    const maxDimension = macro ? 1600 : 1200;
    let width = srcW;
    let height = srcH;
    if (width > maxDimension || height > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    } else {
      width = Math.round(width);
      height = Math.round(height);
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, width, height);

    onCapture(canvas.toDataURL("image/jpeg", macro ? 0.9 : 0.8));
  }

  const label = (es: string, en: string) => (t?.lang === "en" ? en : es);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover transition-transform duration-200"
          style={{ transform: `scale(${digitalZoom})`, transformOrigin: "center" }}
          playsInline
          muted
          autoPlay
        />

        {!isStreaming && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {label("Iniciando cámara…", "Starting camera…")}
            </p>
          </div>
        )}

        {macro && isStreaming && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-48 w-48 rounded-2xl border-2 border-primary/70 shadow-glow" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/90 px-6">
            <div className="glass-crystal rounded-2xl p-5 text-center">
              <p className="text-sm font-medium text-destructive">{error}</p>
              <button
                onClick={onClose}
                className="mt-4 rounded-xl bg-gradient-crystal px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                {label("Cerrar", "Close")}
              </button>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="glass-crystal absolute right-4 top-4 rounded-full p-2 text-primary"
          aria-label={label("Cerrar cámara", "Close camera")}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {isStreaming && !error && (
        <div className="glass-crystal space-y-3 rounded-t-3xl p-4">
          <div className="flex items-center justify-center gap-2">
            {ZOOM_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => applyZoom(level)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  zoom === level
                    ? "bg-gradient-crystal text-primary-foreground"
                    : "glass-crystal text-muted-foreground"
                }`}
              >
                {level}x
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center gap-2">
            <button
              onClick={toggleMacro}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                macro
                  ? "bg-gradient-crystal text-primary-foreground"
                  : "glass-crystal text-muted-foreground"
              }`}
            >
              <Focus className="h-4 w-4" />
              {label("Macro", "Macro")}
            </button>
            {supportsTorch && (
              <button
                onClick={toggleTorch}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                  torch
                    ? "bg-gradient-crystal text-primary-foreground"
                    : "glass-crystal text-muted-foreground"
                }`}
              >
                {torch ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
                {label("Luz", "Light")}
              </button>
            )}
          </div>

          {macro && (
            <p className="text-center text-[11px] text-muted-foreground">
              {label(
                "Modo macro: acerca el objeto 5–10 cm y encuádralo en el marco.",
                "Macro mode: bring the item 5–10 cm close and frame it in the box."
              )}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="glass-crystal flex-1 rounded-xl py-3 font-semibold text-muted-foreground"
            >
              <X className="mx-auto h-5 w-5" />
            </button>
            <button
              onClick={capturePhoto}
              className="flex-1 rounded-xl bg-gradient-crystal py-3 font-semibold text-primary-foreground transition hover:shadow-lg"
            >
              <Check className="mx-auto h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
