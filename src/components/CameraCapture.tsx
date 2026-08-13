```typescript
import { useEffect, useRef, useState } from "react";
import { X, Check, Focus, Zap, ZapOff } from "lucide-react";

// Estructura de datos que devolverá la captura
export interface CameraCaptureResult {
  dataUrl: string;
  isMacro: boolean;
  zoom: number;
}

interface CameraCaptureProps {
  onCapture: (result: CameraCaptureResult) => void;
  onClose: () => void;
  t: Record<string, any>; // Traducciones
}

// Niveles de zoom predefinidos. 'as const' asegura que sean literales inmutables.
const ZOOM_LEVELS = [1, 2, 3, 5] as const;
type ZoomLevel = (typeof ZOOM_LEVELS)[number];

/**
 * Componente de captura de cámara para dispositivos móviles.
 * Permite al usuario tomar una foto con controles de zoom, macro y linterna.
 *
 * @param {object} props - Propiedades del componente.
 * @param {(result: CameraCaptureResult) => void} props.onCapture - Callback al capturar una foto.
 * @param {() => void} props.onClose - Callback al cerrar el componente.
 * @param {Record<string, any>} props.t - Objeto de traducciones para internacionalización.
 */
export function CameraCapture({ onCapture, onClose, t }: CameraCaptureProps) {
  // Refs para los elementos de video y canvas.
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Ref para almacenar el MediaStream activo.
  const streamRef = useRef<MediaStream | null>(null);

  // Estados del componente.
  const [zoom, setZoom] = useState<ZoomLevel>(1); // Nivel de zoom seleccionado por el usuario.
  const [digitalZoom, setDigitalZoom] = useState(1); // Factor de zoom digital aplicado.
  const [macro, setMacro] = useState(false); // Estado del modo macro.
  const [torch, setTorch] = useState(false); // Estado de la linterna.
  const [supportsTorch, setSupportsTorch] = useState(false); // Indica si el dispositivo soporta linterna.
  const [supportsFocus, setSupportsFocus] = useState(false); // Indica si el dispositivo soporta control de enfoque.
  const [error, setError] = useState<string | null>(null); // Mensaje de error si ocurre alguno.
  const [isStreaming, setIsStreaming] = useState(false); // Indica si el stream de video está activo.

  // Hook useEffect para iniciar la cámara al montar el componente y limpiarla al desmontar.
  useEffect(() => {
    startCamera();
    // Limpieza: detiene todas las pistas del stream al desmontar el componente.
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
    // El array de dependencias está vacío para que se ejecute solo al montar/desmontar.
    // El comentario eslint-disable-next-line es para ignorar la advertencia sobre la dependencia de startCamera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Inicia el stream de video de la cámara.
   * Configura la resolución deseada y obtiene las capacidades del dispositivo.
   */
  async function startCamera() {
    try {
      setError(null); // Limpia cualquier error previo.
      // Solicita acceso a la cámara con configuración específica.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" }, // Prioriza la cámara trasera.
          width: { ideal: 1920 }, // Resolución ideal de ancho.
          height: { ideal: 1080 }, // Resolución ideal de alto.
        },
        audio: false, // No se necesita audio.
      });
      streamRef.current = stream; // Almacena el stream en la ref.

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream; // Asigna el stream al elemento de video.
        try {
          await video.play(); // Intenta reproducir el video.
        } catch {
          // Si falla la reproducción automática, se asume que el navegador la maneja.
          // Esto puede ocurrir en algunos contextos donde el autoplay está restringido.
        }
        setIsStreaming(true); // Marca que el streaming ha comenzado.
      }

      // Obtiene la pista de video y sus capacidades.
      const track = stream.getVideoTracks()[0];
      // 'getCapabilities' puede no estar disponible en todos los navegadores/dispositivos.
      const caps: any = (track as any)?.getCapabilities?.() ?? {};
      setSupportsTorch(Boolean(caps.torch)); // Verifica soporte de linterna.
      // Verifica soporte de enfoque manual o si existe la propiedad focusDistance.
      setSupportsFocus(
        Array.isArray(caps.focusMode)
          ? caps.focusMode.includes("manual")
          : Boolean(caps.focusDistance)
      );
    } catch (err) {
      // Captura y muestra el error si ocurre algún problema al acceder a la cámara.
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo acceder a la cámara / Could not access camera"
      );
    }
  }

  /**
   * Aplica el nivel de zoom seleccionado por el usuario.
   * Intenta usar el zoom de hardware y recurre al zoom digital si es necesario.
   * @param {ZoomLevel} level - El nivel de zoom a aplicar (1, 2, 3, 5).
   */
  async function applyZoom(level: ZoomLevel) {
    setZoom(level); // Actualiza el estado del zoom seleccionado.
    const track = streamRef.current?.getVideoTracks()[0];
    const caps: any = (track as any)?.getCapabilities?.() ?? {};

    if (track && caps.zoom) {
      // Calcula el valor de zoom de hardware, asegurándose de que esté dentro de los límites.
      const hw = Math.min(Math.max(level, caps.zoom.min ?? 1), caps.zoom.max ?? 1);
      try {
        // Intenta aplicar el zoom de hardware.
        await (track as any).applyConstraints({ advanced: [{ zoom: hw }] });
        // Calcula el zoom digital restante necesario para alcanzar el nivel deseado.
        const remaining = level / hw;
        setDigitalZoom(remaining);
        return; // Sale de la función si el zoom de hardware se aplicó correctamente.
      } catch {
        // Si falla la aplicación del zoom de hardware, se recurre al zoom digital.
        // El mensaje de error no se muestra al usuario, se asume que es un fallback.
      }
    }
    // Si no hay soporte de zoom de hardware o falla, se aplica zoom puramente digital.
    setDigitalZoom(level);
  }

  /**
   * Alterna el estado del modo macro.
   * Si se activa, intenta configurar el enfoque en modo manual "manual" y la distancia mínima.
   * Si se desactiva, intenta configurar el enfoque en modo "continuous".
   * También ajusta el zoom automáticamente al activar/desactivar macro.
   */
  async function toggleMacro() {
    const next = !macro; // Determina el próximo estado del modo macro.
    setMacro(next); // Actualiza el estado del modo macro.
    const track = streamRef.current?.getVideoTracks()[0];
    const caps: any = (track as any)?.getCapabilities?.() ?? {};

    if (track && supportsFocus) {
      try {
        if (next) {
          // Si se activa macro, intenta enfocar manualmente lo más cerca posible.
          const near = caps.focusDistance?.min ?? 0;
          await (track as any).applyConstraints({
            advanced: [{ focusMode: "manual", focusDistance: near }],
          });
        } else {
          // Si se desactiva macro, vuelve al enfoque continuo.
          await (track as any).applyConstraints({
            advanced: [{ focusMode: "continuous" }],
          });
        }
      } catch {
        // Si falla la aplicación de constraints de enfoque, se mantiene la asistencia digital.
        // No se muestra error al usuario.
      }
    }

    // Ajusta el zoom automáticamente al activar o desactivar Macro.
    if (next && zoom < 2) await applyZoom(2); // Si se activa macro y el zoom es menor a 2x, lo sube a 2x.
    if (!next) await applyZoom(1); // Si se desactiva macro, resetea el zoom a 1x.
  }

  /**
   * Alterna el estado de la linterna.
   * Solo funciona si el dispositivo soporta linterna.
   */
  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !supportsTorch) return; // Sale si no hay pista de video o no soporta linterna.
    const next = !torch; // Determina el próximo estado de la linterna.
    try {
      // Aplica la constraint para encender o apagar la linterna.
      await (track as any).applyConstraints({ advanced: [{ torch: next }] });
      setTorch(next); // Actualiza el estado de la linterna.
    } catch {
      // Ignora errores si el dispositivo no permite controlar la linterna.
    }
  }

  /**
   * Captura una foto del frame actual del video.
   * Realiza el recorte central basado en el zoom digital aplicado y redimensiona la imagen.
   * La resolución máxima de la imagen capturada se ajusta según el modo macro.
   * @returns {void}
   */
  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return; // Sale si los elementos de video o canvas no están disponibles.
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // Sale si no se pudo obtener el contexto 2D del canvas.

    const z = digitalZoom;
    // Calcula las dimensiones y la posición del área a recortar del video.
    const srcW = video.videoWidth / z;
    const srcH = video.videoHeight / z;
    const srcX = (video.videoWidth - srcW) / 2;
    const srcY = (video.videoHeight - srcH) / 2;

    // Define la dimensión máxima para la imagen capturada. Mayor resolución en modo macro.
    const maxDimension = macro ? 1600 : 1200;
    let width = srcW;
    let height = srcH;

    // Escala la imagen si excede la dimensión máxima.
    if (width > maxDimension || height > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    } else {
      width = Math.round(width);
      height = Math.round(height);
    }

    canvas.width = width; // Establece el ancho del canvas.
    canvas.height = height; // Establece el alto del canvas.
    // Dibuja la porción recortada del video en el canvas con las dimensiones calculadas.
    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, width, height);

    // Convierte el contenido del canvas a una URL de datos JPEG.
    // La calidad de compresión es mayor en modo macro para preservar detalle.
    const dataUrl = canvas.toDataURL("image/jpeg", macro ? 0.9 : 0.8);

    // Llama al callback onCapture con los datos de la imagen, estado macro y zoom.
    onCapture({
      dataUrl,
      isMacro: macro,
      zoom, // Devuelve el nivel de zoom seleccionado por el usuario, no el digital.
    });
  }

  /**
   * Función auxiliar para obtener el texto traducido basado en el idioma actual.
   * @param {string} es - Texto en español.
   * @param {string} en - Texto en inglés.
   * @returns {string} El texto traducido.
   */
  const label = (es: string, en: string) => (t?.lang === "en" ? en : es);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="relative flex-1 overflow-hidden">
        {/* Elemento de video para mostrar el stream de la cámara. */}
        <video
          ref={videoRef}
          className="h-full w-full object-cover transition-transform duration-200"
          // Aplica el zoom digital mediante la propiedad transform.
          style={{ transform: `scale(${digitalZoom})`, transformOrigin: "center" }}
          playsInline // Reproducción en línea.
          muted // Sin sonido.
          autoPlay // Reproducción automática.
        />

        {/* Indicador de carga mientras se inicia la cámara. */}
        {!isStreaming && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <p className="text-sm font-semibold text-primary">
              {label("Iniciando cámara…", "Starting camera…")}
            </p>
          </div>
        )}

        {/* Marco visual para el modo macro. */}
        {macro && isStreaming && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-48 w-48 rounded-2xl border-2 border-primary/70 shadow-glow" />
          </div>
        )}

        {/* Pantalla de error si no se puede acceder a la cámara. */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background px-6">
            <div className="glass-crystal rounded-2xl p-5 text-center">
              <p className="text-sm font-semibold text-primary">{error}</p>
              <button
                onClick={onClose}
                className="mt-4 rounded-xl bg-gradient-crystal px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                {label("Cerrar", "Close")}
              </button>
            </div>
          </div>
        )}

        {/* Botón para cerrar la cámara. */}
        <button
          onClick={onClose}
          className="glass-crystal absolute right-4 top-4 rounded-full p-2 text-primary"
          aria-label={label("Cerrar cámara", "Close camera")}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Controles de la cámara si el streaming está activo y no hay error. */}
      {isStreaming && !error && (
        <div className="glass-crystal space-y-3 rounded-t-3xl p-4">
          {/* Controles de zoom. */}
          <div className="flex items-center justify-center gap-2">
            {ZOOM_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => applyZoom(level)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  zoom === level
                    ? "bg-gradient-crystal text-primary-foreground" // Estilo activo.
                    : "glass-crystal text-muted-foreground" // Estilo inactivo.
                }`}
              >
                {level}x
              </button>
            ))}
          </div>

          {/* Controles de macro y linterna. */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={toggleMacro}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                macro
                  ? "bg-gradient-crystal text-primary-foreground" // Estilo activo.
                  : "glass-crystal text-muted-foreground" // Estilo inactivo.
              }`}
            >
              <Focus className="h-4 w-4" />
              {label("Macro", "Macro")}
            </button>
            {supportsTorch && ( // Muestra el botón de linterna solo si el dispositivo lo soporta.
              <button
                onClick={toggleTorch}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                  torch
                    ? "bg-gradient-crystal text-primary-foreground" // Estilo activo.
                    : "glass-crystal text-muted-foreground" // Estilo inactivo.
                }`}
              >
                {torch ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
                {label("Luz", "Light")}
              </button>
            )}
          </div>

          {/* Mensaje de ayuda para el modo macro. */}
          {macro && (
            <p className="text-center text-[11px] text-muted-foreground">
              {label(
                "Modo macro: acerca el objeto 5–10 cm y encuádralo en el marco.",
                "Macro mode: bring the item 5–10 cm close and frame it in the box."
              )}
            </p>
          )}

          {/* Botones de acción principal: cerrar y capturar. */}
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

      {/* Canvas oculto para la captura de la foto. */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
```
