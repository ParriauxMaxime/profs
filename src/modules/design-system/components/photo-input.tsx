import { PHOTO_SIZE, squareCrop } from "@domain/photo";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * A pupil photograph, downscaled in the browser and never uploaded.
 *
 * The file never leaves the device: it goes into an object URL, onto a canvas,
 * and back out as a Blob for IndexedDB. `createObjectURL` results are revoked
 * on unmount and between selections, or a long editing session leaks them.
 */
export function PhotoInput({
  value,
  onChange,
}: {
  value: Blob | undefined;
  onChange: (photo: Blob | null) => void;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const handleFile = async (file: File): Promise<void> => {
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      const { sx, sy, size } = squareCrop(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = PHOTO_SIZE;
      canvas.height = PHOTO_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, sx, sy, size, size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.82),
      );
      if (blob) onChange(blob);
    } finally {
      URL.revokeObjectURL(url);
      // Clearing the input lets the same file be chosen again after a removal.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      {preview ? (
        <img
          src={preview}
          alt=""
          className="h-16 w-16 rounded-full object-cover"
          width={64}
          height={64}
        />
      ) : (
        <div className="h-16 w-16 rounded-full bg-bg-subtle" />
      )}
      <div className="flex flex-col gap-1">
        <label className="btn cursor-pointer">
          {value ? t("student.photo") : t("student.addPhoto")}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </label>
        {value && (
          <button type="button" className="text-sm text-danger" onClick={() => onChange(null)}>
            {t("student.removePhoto")}
          </button>
        )}
      </div>
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image decode failed"));
    image.src = src;
  });
}
