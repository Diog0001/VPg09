import { FormEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Field, Notice } from "../components/ui";
import { api } from "../lib/api";
import { usePageTitle } from "../lib/usePageTitle";
import type { Workspace } from "../lib/types";

export function LoginPage() {
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [email, setEmail] = useState("demo@vyaz.local");
  const [password, setPassword] = useState("demo");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  usePageTitle("Вязь — Вход");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await api.login(email, password);
      const workspaces = (await api.workspaces()) as Workspace[];
      if (workspaces[0]) {
        navigate(`/w/${workspaces[0].id}`);
      } else {
        setError("Нет доступных пространств. Создайте workspace в API и войдите снова.");
        headingRef.current?.focus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти. Проверьте email и пароль.");
      headingRef.current?.focus();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="vyaz-login">
      <aside className="vyaz-login__brand" aria-hidden="true">
        <h2 className="vyaz-login__wordmark">Вязь</h2>
        <p>Доска задач, которая помнит связи. Откройте карточку — сначала превью, конструктор по кнопке.</p>
      </aside>
      <div className="vyaz-login__panel">
        <div className="vyaz-login__form">
          <h1 ref={headingRef} tabIndex={-1}>
            Вход в Вязь
          </h1>
          <p>Демо-доступ: demo@vyaz.local / demo</p>
          <form onSubmit={onSubmit}>
            <Field
              id="email"
              type="email"
              autoComplete="username"
              label="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Field
              id="password"
              type="password"
              autoComplete="current-password"
              label="Пароль"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error ? <Notice title="Не удалось войти">{error}</Notice> : null}
            <Button type="submit" kind="ink" disabled={pending}>
              {pending ? "Входим…" : "Войти"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
