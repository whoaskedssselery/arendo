import { ImagesIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const maxPhotos = 10;
const maxBytes = 5 * 1024 * 1024;
const types = ["image/jpeg", "image/png", "image/webp"];

/** Фото, выбранные до создания помещения: загружаются после него. */
export function PhotoPicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);

  function add(list: FileList) {
    const chosen = [...list];
    const fit = chosen.filter(
      (f) => types.includes(f.type) && f.size <= maxBytes,
    );
    if (fit.length < chosen.length)
      toast.error("Подходят только JPEG, PNG и WebP до 5 МБ.");
    if (files.length + fit.length > maxPhotos)
      toast.error(`Не больше ${maxPhotos} фото.`);
    onChange([...files, ...fit].slice(0, maxPhotos));
  }

  return (
    <fieldset className="photo-picker">
      <legend>Фото (необязательно, первое станет главным)</legend>
      <div className="photo-grid">
        {files.map((file, i) => (
          <figure key={previews[i] ?? file.name}>
            <img className="tile" src={previews[i]} alt={file.name} />
            <button
              type="button"
              className="icon-button"
              aria-label={`Убрать ${file.name}`}
              onClick={() => onChange(files.filter((_, n) => n !== i))}
            >
              <TrashIcon size={18} aria-hidden />
            </button>
          </figure>
        ))}
        {files.length < maxPhotos && (
          <label className="upload">
            <ImagesIcon size={24} aria-hidden />
            Выбрать фото
            <input
              type="file"
              multiple
              accept={types.join(",")}
              onChange={(e) => {
                if (e.target.files) add(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
    </fieldset>
  );
}
