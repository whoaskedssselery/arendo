import { UploadSimpleIcon, XIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { request } from "./api";
import {
  CategoryIcon,
  categoryIcons,
  iconKey,
  iconPath,
  isUploadedIcon,
} from "./CategoryIcon";
import { client } from "./query";
import type { Category } from "./types";
import { ErrorBox } from "./ui";

const maxBytes = 512 * 1024;
const types = ["image/png", "image/jpeg", "image/webp"];

export function IconButton({ category }: { category: Category }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="secondary icon-choose"
        aria-label={`Изменить иконку категории ${category.name}`}
        title="Изменить иконку"
        onClick={() => setOpen(true)}
      >
        <CategoryIcon name={category.name} photoUrl={category.photoUrl} />
      </button>
      {open && (
        <IconDialog category={category} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function IconDialog({
  category,
  onClose,
}: {
  category: Category;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const current = isUploadedIcon(category.photoUrl)
    ? ""
    : iconKey(category.name, category.photoUrl);
  const [key, setKey] = useState(current);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [problem, setProblem] = useState("");
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const save = useMutation({
    mutationFn: () => {
      if (!file)
        return request(`/categories/${category.id}`, {
          method: "PATCH",
          body: JSON.stringify({ photoUrl: iconPath(key) }),
        });
      const form = new FormData();
      form.append("file", file);
      return request(`/categories/${category.id}/icon`, {
        method: "POST",
        body: form,
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Иконка обновлена.");
      onClose();
    },
  });

  function choose(next?: File) {
    if (!next) return;
    if (!types.includes(next.type))
      return setProblem("Подойдёт только PNG, JPEG или WebP.");
    if (next.size > maxBytes)
      return setProblem("Файл больше 512 КБ. Выберите поменьше.");
    setProblem("");
    setFile(next);
    setKey("");
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    choose(e.dataTransfer.files[0]);
  }

  const shown = preview ?? (key ? undefined : category.photoUrl);
  const unchanged = !file && key === current;
  return (
    <dialog ref={ref} className="dialog icon-dialog" onClose={onClose}>
      <header>
        <h2>Иконка категории «{category.name}»</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Закрыть"
          onClick={onClose}
        >
          <XIcon size={18} aria-hidden />
        </button>
      </header>
      <fieldset className="icon-grid">
        <legend>Из набора Arendo</legend>
        {Object.entries(categoryIcons).map(([id, [Shape, label]]) => (
          <button
            type="button"
            key={id}
            aria-label={label}
            title={label}
            aria-pressed={key === id}
            onClick={() => {
              setKey(id);
              setFile(undefined);
              setProblem("");
            }}
          >
            <Shape
              size={24}
              weight={key === id ? "fill" : "regular"}
              aria-hidden
            />
          </button>
        ))}
      </fieldset>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: перетаскивание дополняет обычный выбор файла */}
      <label
        className={`dropzone${over ? " over" : ""}${file ? " chosen" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <input
          type="file"
          className="sr-only"
          accept={types.join(",")}
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {shown ? (
          <img src={shown} alt="Выбранная иконка" />
        ) : (
          <UploadSimpleIcon size={28} aria-hidden />
        )}
        <span>
          <b>{file ? file.name : "Свой файл: перетащите или выберите"}</b>
          <small>PNG, JPEG или WebP до 512 КБ, лучше квадрат без фона</small>
        </span>
      </label>
      <ErrorBox error={problem ? new Error(problem) : save.error} />
      <div className="dialog-actions">
        <button type="button" className="secondary" onClick={onClose}>
          Отмена
        </button>
        <button
          type="button"
          disabled={unchanged || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
    </dialog>
  );
}
