import { HouseLineIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { post, setSession } from "../api";
import { authImage } from "../images";
import { client } from "../query";
import type { Session } from "../types";
import { ErrorBox, Field, PasswordField } from "../ui";

export default function Auth({ register = false }: { register?: boolean }) {
  const nav = useNavigate();
  const [validation, setValidation] = useState("");
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
  return (
    <section className="auth">
      <img src={authImage} alt="" />
      <div className="auth-body">
        <h1>{register ? "Создать аккаунт" : "Вход"}</h1>
        <p>
          {register
            ? "Арендуйте помещения или сдавайте свои."
            : "Войдите, чтобы управлять арендами."}
        </p>
        <form onSubmit={submit}>
          {register && (
            <>
              <fieldset className="roles">
                <legend>Я хочу</legend>
                <label>
                  <input
                    type="radio"
                    name="role"
                    value="tenant"
                    defaultChecked
                  />
                  <MagnifyingGlassIcon size={24} aria-hidden />
                  Арендовать
                </label>
                <label>
                  <input type="radio" name="role" value="owner" />
                  <HouseLineIcon size={24} aria-hidden />
                  Сдавать
                </label>
              </fieldset>
              <Field
                label="Имя и фамилия"
                name="fullName"
                required
                maxLength={150}
                autoComplete="name"
              />
              <Field
                label="Телефон (необязательно)"
                name="phone"
                type="tel"
                pattern="\+?[0-9]{10,15}"
                autoComplete="tel"
              />
            </>
          )}
          <Field
            label="Email"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
          <PasswordField
            label="Пароль"
            name="password"
            required
            minLength={register ? 8 : 1}
            autoComplete={register ? "new-password" : "current-password"}
          />
          <ErrorBox
            error={validation ? new Error(validation) : mutation.error}
          />
          <button type="submit" className="wide" disabled={mutation.isPending}>
            {mutation.isPending
              ? "Подождите…"
              : register
                ? "Зарегистрироваться"
                : "Войти"}
          </button>
        </form>
        <p>
          {register ? "Уже есть аккаунт?" : "Нет аккаунта?"}{" "}
          <Link className="text-link" to={register ? "/login" : "/register"}>
            {register ? "Войти" : "Регистрация"}
          </Link>
        </p>
      </div>
    </section>
  );
}
