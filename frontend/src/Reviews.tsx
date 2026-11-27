import { StarIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { post, request } from "./api";
import { client } from "./query";
import type { Review } from "./types";
import { date, ErrorBox } from "./ui";

export function ReviewList({ roomId }: { roomId: number }) {
  const reviews = useQuery({
    queryKey: ["reviews", roomId],
    queryFn: ({ signal }) =>
      request<Review[]>(`/rooms/${roomId}/reviews`, { signal }),
    staleTime: 180000,
  });
  return (
    <section className="block">
      <h2>Отзывы</h2>
      <ErrorBox error={reviews.error} />
      {reviews.data?.length === 0 && <p className="muted">Отзывов пока нет.</p>}
      <ul className="reviews">
        {reviews.data?.map((r) => (
          <li key={r.id}>
            <div>
              <b>{r.author}</b>
              <span className="rating">
                <StarIcon weight="fill" aria-hidden />
                {r.rating}
              </span>
            </div>
            <small>{date(r.createdAt)}</small>
            {r.comment && <p>{r.comment}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Кнопка с окном: оценка от 1 до 5 и текст. */
export function ReviewButton({
  bookingId,
  kind,
}: {
  bookingId: number;
  kind: "review" | "tenant-review";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [rating, setRating] = useState(5);
  const label = kind === "review" ? "Оставить отзыв" : "Оценить арендатора";
  const mutation = useMutation({
    mutationFn: (comment: string) =>
      post(`/bookings/${bookingId}/${kind}`, { rating, comment }),
    onSuccess: async () => {
      ref.current?.close();
      toast.success(
        kind === "review" ? "Отзыв сохранён." : "Оценка сохранена.",
      );
      await Promise.all(
        ["bookings", "reviews", "room", "rooms", "tenants"].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mutation.mutate(String(new FormData(e.currentTarget).get("comment")));
  }
  return (
    <>
      <button
        type="button"
        className="secondary"
        onClick={() => ref.current?.showModal()}
      >
        {label}
      </button>
      <dialog ref={ref} className="dialog">
        <form onSubmit={submit}>
          <h2>{label}</h2>
          <fieldset className="stars">
            <legend className="sr-only">Оценка</legend>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                type="button"
                key={value}
                aria-label={`Оценка ${value}`}
                aria-pressed={rating === value}
                onClick={() => setRating(value)}
              >
                <StarIcon
                  size={30}
                  weight={value <= rating ? "fill" : "regular"}
                  aria-hidden
                />
              </button>
            ))}
          </fieldset>
          <label className="field">
            Комментарий
            <textarea name="comment" rows={4} maxLength={1000} />
          </label>
          <ErrorBox error={mutation.error} />
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => ref.current?.close()}
            >
              Не сейчас
            </button>
            <button type="submit" disabled={mutation.isPending}>
              Отправить
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
