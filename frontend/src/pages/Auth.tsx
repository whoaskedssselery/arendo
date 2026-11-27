import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { client } from "../query";
import { post, demo, setSession } from "../api";
import type { Session } from "../types";
import { ErrorBox, Field } from "../ui";
export default function Auth({ register = false }: { register?: boolean }) {
  const nav = useNavigate();
  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      post<Session>(register ? "/auth/register" : "/auth/login", body),
    onSuccess: (s) => {
      client.clear();
      setSession(s);
      nav(
        s.user.role === "owner"
          ? "/owner"
          : s.user.role === "admin"
            ? "/admin"
            : "/bookings",
      );
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    if (register && !body.phone) delete body.phone;
    if (
      register &&
      new TextEncoder().encode(String(body.password)).length > 72
    ) {
      setValidation("Пароль должен занимать не более 72 байт UTF-8.");
      return;
    }
    setValidation("");
    mutation.mutate(body);
  }
  const [validation, setValidation] = useState("");
  return (
    <section className="auth panel">
      <p className="eyebrow">ДОБРО ПОЖАЛОВАТЬ В ARENDO</p>
      <h1>{register ? "Создать аккаунт" : "Рады видеть вас снова"}</h1>
      <p>
        {register
          ? "Находите пространство или сдавайте своё."
          : "Войдите, чтобы управлять своими арендами."}
      </p>
      <form onSubmit={submit}>
        {register && (
          <>
            <Field
              label="Имя и фамилия"
              name="fullName"
              required
              maxLength={150}
            />
            <Field
              label="Телефон (необязательно)"
              name="phone"
              type="tel"
              pattern="\+?[0-9]{10,15}"
            />
            <label>
              Я хочу
              <select aria-label="Я хочу" name="role">
                <option value="tenant">Арендовать пространство</option>
                <option value="owner">Сдавать помещения</option>
              </select>
            </label>
          </>
        )}
        <Field
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
        <Field
          label="Пароль"
          name="password"
          type="password"
          required
          minLength={register ? 8 : 1}
          autoComplete={register ? "new-password" : "current-password"}
        />
        <ErrorBox error={validation ? new Error(validation) : mutation.error} />
        <button disabled={mutation.isPending}>
          {mutation.isPending
            ? "Подождите…"
            : register
              ? "Зарегистрироваться"
              : "Войти"}
        </button>
      </form>
      <p>
        {register ? "Уже есть аккаунт?" : "Первый раз здесь?"}{" "}
        <Link to={register ? "/login" : "/register"}>
          {register ? "Войти" : "Регистрация"}
        </Link>
      </p>
      {demo && (
        <div className="demo-help">
          Демо: tenant@arendo.test, owner@arendo.test или admin@arendo.test
          <br />
          Пароль: Arendo123!
        </div>
      )}
    </section>
  );
}
