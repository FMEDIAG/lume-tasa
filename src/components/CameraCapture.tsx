import { useEffect, useRef, useState } from "react";
import { X, Check } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
  t: Record<string, any>;
}

type ZoomLevel = 0.6 | 1 | 2;

export function CameraCapture({ onCapture, onClose, t }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [zoom, setZoom] = useState<ZoomLevel>(1);
  const [supportsZoom, setSupportsZoom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  async function startCamera() {
    try {
      setError(null);
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsStreaming(true);
          checkZoomCapability(stream);
        };
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo acceder a la cámara / Could not access camera"
      );
    }
  }

  function checkZoomCapability(stream: MediaStream) {
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      const capabilities = (videoTrack as any).getCapabilities?.();
      if (capabilities?.zoom) {
        setSupportsZoom(true);
      }
    }
  }

  async function applyZoom(level: ZoomLevel) {
    const videoTrack = streamRef.current?.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      const constraints: any = {
        advanced: [{ zoom: level }],
      };
      await videoTrack.applyConstraints(constraints);
      setZoom(level);
    } catch (err) {
      // Si el zoom no es soportado, solo cambiamos el estado
      // pero continuamos funcionando sin zoom real
      setZoom(level);
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    onCapture(dataUrl);
  }

  const zoomLevels: ZoomLevel[] = [0.6, 1, 2];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Video Stream */}
      <div className="relative flex-1 overflow-hidden">
        {isStreaming ? (
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-white">
              <p className="mt-4 text-sm">Iniciando cámara...</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center text-white">
              <p className="text-sm font-medium text-destructive">{error}</p>
              <button
                onClick={onClose}
                className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Cerrar / Close
              </button>
            </div>
          </div>
        )}

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white backdrop-blur transition hover:bg-black/70"
          aria-label="Close camera"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Controls */}
      {isStreaming && !error && (
        <div className="space-y-3 bg-black/80 p-4 backdrop-blur">
          {/* Zoom Controls */}
          <div className="flex items-center justify-center gap-2">
            {zoomLevels.map((level) => {
              const labels: Record<ZoomLevel, string> = {
                0.6: "🔍 Macro",
                1: "1x",
                2: "2x",
              };

              return (
                <button
                  key={level}
                  onClick={() => applyZoom(level)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    zoom === level
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/20 text-white hover:bg-white/30"
                  }`}
                >
                  {labels[level]}
                </button>
              );
            })}
          </div>

          {/* Capture and Close Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg bg-white/10 py-3 font-semibold text-white transition hover:bg-white/20"
            >
              <X className="mx-auto h-5 w-5" />
            </button>
            <button
              onClick={capturePhoto}
              className="flex-1 rounded-lg bg-gradient-crystal py-3 font-semibold text-primary-foreground transition hover:shadow-lg"
            >
              <Check className="mx-auto h-5 w-5" />
            </button>
          </div>

          {!supportsZoom && zoom !== 1 && (
            <p className="text-center text-xs text-muted-foreground">
              ℹ️ Zoom avanzado no disponible / Advanced zoom not available
            </p>
          )}
        </div>
      )}

      {/* Hidden Canvas for Photo Capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
