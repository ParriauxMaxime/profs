import { PHOTO_SIZE, squareCrop } from "@domain/photo";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./modal";

/**
 * A pupil photograph, downscaled in the browser and never uploaded.
 *
 * The file never leaves the device: it goes into an object URL, onto a canvas,
 * and back out as a Blob for IndexedDB. `createObjectURL` results are revoked
 * on unmount and between selections, or a long editing session leaks them.
 *
 * **The avatar IS the control.** It replaced an avatar sitting beside a
 * full-width "Ajouter une photo" and a "Retirer la photo" beneath it — three
 * elements and a wrap, for a field a teacher fills once a year, at the top of
 * a page whose subject is the pupil rather than their picture. Empty, a tap
 * opens the file picker; set, it opens the two choices. The affordance the
 * label used to carry is now the `+` badge, the accessible name and the title.
 *
 * The menu goes through `Modal` rather than an anchored popover. Escape,
 * focus-trap, backdrop-close and return-focus is a list this codebase keeps
 * exactly one copy of, and two buttons are not worth a second.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);

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

  const pick = (): void => inputRef.current?.click();

  return (
    <>
      <button
        ref={avatarRef}
        type="button"
        // Empty goes straight to the picker: there is only one thing to do, and
        // a menu offering it alone is a tap spent on nothing.
        onClick={() => (value ? setMenuOpen(true) : pick())}
        title={value ? t("student.photo") : t("student.addPhoto")}
        aria-label={value ? t("student.photo") : t("student.addPhoto")}
        aria-haspopup={value ? "dialog" : undefined}
        className="relative size-(--control-min) shrink-0 rounded-full border border-border hover:bg-bg-hover"
      >
        {preview ? (
          <img
            src={preview}
            alt=""
            className="size-full rounded-full object-cover"
            width={PHOTO_SIZE}
            height={PHOTO_SIZE}
          />
        ) : (
          // The badge is what an empty circle was missing: a grey disc says
          // nothing, and this control no longer has a label beside it.
          <span
            aria-hidden="true"
            className="flex size-full items-center justify-center rounded-full bg-bg-subtle text-lg text-text-muted"
          >
            +
          </span>
        )}
      </button>

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

      <Modal
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        labelledBy="photo-menu-title"
        returnFocusTo={avatarRef}
      >
        <h2 id="photo-menu-title" className="font-semibold">
          {t("student.photo")}
        </h2>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setMenuOpen(false);
              pick();
            }}
          >
            {t("student.changePhoto")}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              setMenuOpen(false);
              onChange(null);
            }}
          >
            {t("student.removePhoto")}
          </button>
        </div>
      </Modal>
    </>
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
