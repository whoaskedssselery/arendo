import { CaretLeftIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import { type KeyboardEvent, type TouchEvent, useRef, useState } from "react";
import type { Room } from "./types";
import { RoomPhoto } from "./ui";

/** Главное фото с листанием, миниатюрами и просмотром во весь экран. */
export function Gallery({ room }: { room: Room }) {
  const photos = [...room.photos].sort(
    (a, b) => Number(b.isMain) - Number(a.isMain) || a.sortOrder - b.sortOrder,
  );
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const touchX = useRef(0);
  const count = photos.length;
  const current = photos[Math.min(index, count - 1)];
  if (!current)
    return <RoomPhoto className="detail-photo" title={room.title} />;

  const go = (step: number) => setIndex((i) => (i + step + count) % count);
  const keys = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  };
  const swipe = {
    onTouchStart: (e: TouchEvent) => {
      touchX.current = e.touches[0].clientX;
    },
    onTouchEnd: (e: TouchEvent) => {
      const shift = e.changedTouches[0].clientX - touchX.current;
      if (count > 1 && Math.abs(shift) > 40) go(shift > 0 ? -1 : 1);
    },
  };
  const arrows = count > 1 && (
    <>
      <button
        type="button"
        className="slide-arrow prev"
        aria-label="Предыдущее фото"
        onClick={() => go(-1)}
      >
        <CaretLeftIcon size={20} weight="bold" aria-hidden />
      </button>
      <button
        type="button"
        className="slide-arrow next"
        aria-label="Следующее фото"
        onClick={() => go(1)}
      >
        <CaretRightIcon size={20} weight="bold" aria-hidden />
      </button>
      <span className="slide-count" aria-live="polite">
        {Math.min(index, count - 1) + 1} / {count}
      </span>
    </>
  );

  return (
    <div className="slider">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: стрелки клавиатуры дополняют кнопки */}
      <div className="slide" onKeyDown={keys} {...swipe}>
        <button
          type="button"
          className="slide-open"
          aria-label="Открыть фото во весь экран"
          onClick={() => dialog.current?.showModal()}
        >
          <RoomPhoto
            key={current.id}
            className="detail-photo"
            url={current.url}
            title={room.title}
          />
        </button>
        {arrows}
      </div>
      {count > 1 && (
        <div className="thumbs">
          {photos.map((p, i) => (
            <button
              type="button"
              key={p.id}
              aria-label={`Фото ${i + 1}`}
              aria-pressed={p.id === current.id}
              onClick={() => setIndex(i)}
            >
              <RoomPhoto className="tile" url={p.url} title={room.title} lazy />
            </button>
          ))}
        </div>
      )}
      <dialog ref={dialog} className="lightbox" onKeyDown={keys}>
        <div className="lightbox-body" {...swipe}>
          <img src={current.url} alt={room.title} />
          {arrows}
          <button
            type="button"
            className="slide-arrow close"
            aria-label="Закрыть просмотр"
            onClick={() => dialog.current?.close()}
          >
            <XIcon size={20} weight="bold" aria-hidden />
          </button>
        </div>
      </dialog>
    </div>
  );
}
