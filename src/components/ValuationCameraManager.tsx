import React, { useState } from "react";
import { CameraCapture, CameraCaptureResult } from "./CameraCapture";
import { saveValuationImage, StoredImage } from "@/lib/db";
import { Camera, Sparkles, Trash2, Layers } from "lucide-react";

interface ValuationCameraManagerProps {
  valuationId?: string; // ID único de la tasación (opcional si es un borrador)
  onImagesUpdated: (images: StoredImage[]) => void;
  t?: Record<string, any>;
}

export function ValuationCameraManager({
  valuationId,
  onImagesUpdated,
  t,
}: ValuationCameraManagerProps) {
  const [showCamera, setShowCamera] = useState(false);
  const [images, setImages] = useState<StoredImage[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Manejador que recibe la captura con metadatos de la cámara
  const handleCapture = async (result: CameraCaptureResult) => {
    setIsSaving(true);
    try {
      // 1. Preparamos el objeto para IndexedDB
      const newImagePayload: Omit<StoredImage, "id"> = {
        valuationId: valuationId ?? "draft",
        dataUrl: result.dataUrl,
        isMacro: result.isMacro,
        zoom: result.zoom,
        createdAt: new Date().toISOString(),
      };

      // 2. Guardamos la imagen en LumeDB (IndexedDB)
      const insertedId = await saveValuationImage(newImagePayload);

      const savedImage: StoredImage = {
        ...newImagePayload,
        id: insertedId,
      };

      // 3. Actualizamos el estado local y notificamos al componente padre
      const updatedList = [...images, savedImage];
      setImages(updatedList);
      onImagesUpdated(updatedList);
    } catch (error) {
      console.error("Error guardando imagen en IndexedDB (LumeDB):", error);
    } finally {
      setIsSaving(false);
      setShowCamera(false);
    }
  };

  // Permite eliminar una imagen de la lista local
  const handleRemoveImage = (indexToRemove: number) => {
    const updatedList = images.filter((_, index) => index !== indexToRemove);
    setImages(updatedList);
    onImagesUpdated(updatedList);
  };

  return (
    <div className="space-y-4">
      {/* Botón Principal para Activar la Cámara */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowCamera(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-crystal px-4 py-3 text-sm font-semibold text-primary-foreground shadow-md transition hover:shadow-lg active:scale-95"
        >
          <Camera className="h-5 w-5" />
          <span>Capturar con Cámara Lume</span>
        </button>

        {images.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Layers className="h-4 w-4" />
            {images.length} {images.length === 1 ? "captura" : "capturas"}
          </span>
        )}
      </div>

      {/* Indicador de Guardado en DB */}
      {isSaving && (
        <p className="text-xs font-medium text-sky-500 animate-pulse">
          Almacenando imagen a alta resolución en LumeDB...
        </p>
      )}

      {/* Galería de Vistas Previas de las Fotos Tomadas */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, index) => (
            <div
              key={img.id ?? index}
              className="group relative overflow-hidden rounded-xl border border-border bg-card p-1 shadow-sm transition hover:shadow-md"
            >
              <img
                src={img.dataUrl}
                alt={`Captura ${index + 1}`}
                className="h-28 w-full rounded-lg object-cover"
              />

              {/* Insignias tácticas: Marca si es Macro y el Zoom aplicado */}
              <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                {img.isMacro && (
                  <span className="flex items-center gap-1 rounded-md bg-sky-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm shadow-sm">
                    <Sparkles className="h-3 w-3" />
                    MACRO
                  </span>
                )}
                <span className="rounded-md bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm shadow-sm">
                  {img.zoom}x
                </span>
              </div>

              {/* Botón para Eliminar Captura */}
              <button
                type="button"
                onClick={() => handleRemoveImage(index)}
                className="absolute top-2 right-2 rounded-full bg-red-500/90 p-1.5 text-white opacity-90 transition sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-600"
                title="Eliminar captura"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Despliegue de la Cámara en Pantalla Completa */}
      {showCamera && (
        <CameraCapture
          onCapture={handleCapture}
          onClose={() => setShowCamera(false)}
          t={t ?? { lang: "es" }}
        />
      )}
    </div>
  );
}
