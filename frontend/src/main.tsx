import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Link, NavLink, Routes, Route, useNavigate } from "react-router-dom";
import { client } from "./query";
import { post, demo, setSession } from "./api";
import { useSession, ErrorBox, Protect } from "./ui";
import Catalog from "./pages/Catalog";
import RoomPage from "./pages/RoomPage";
import Auth from "./pages/Auth";
import Bookings from "./pages/Bookings";
import Owner from "./pages/Owner";
import TenantPage from "./pages/TenantPage";
import Admin from "./pages/Admin";
import "./style.css";
function App() {
  const s = useSession();
  const nav = useNavigate();
  const [logoutError, setLogoutError] = useState<unknown>();
  async function logout() {
    try {
      await post("/auth/logout");
      setSession(null);
      client.clear();
      nav("/");
    } catch (e) {
      setLogoutError(e);
    }
  }
  return (
    <>
      <header>
        <Link className="brand" to="/">
          arendo<span>пространство для ваших планов</span>
        </Link>
        <nav>
          <NavLink to="/">Каталог</NavLink>
          {s && <NavLink to="/bookings">Мои аренды</NavLink>}
          {s?.user.role === "owner" && (
            <NavLink to="/owner">Кабинет владельца</NavLink>
          )}
          {s?.user.role === "admin" && (
            <NavLink to="/admin">Администрирование</NavLink>
          )}
        </nav>
        {s ? (
          <div className="account">
            <span>{s.user.fullName}</span>
            <button className="ghost" onClick={logout}>
              Выйти
            </button>
          </div>
        ) : (
          <Link className="button small" to="/login">
            Войти
          </Link>
        )}
      </header>
      {demo && (
        <div className="demo">
          Демонстрационный режим · данные учебные и сбрасываются при
          перезагрузке страницы
        </div>
      )}
      <main>
        <ErrorBox error={logoutError} />
        <Routes>
          <Route path="/" element={<Catalog />} />
          <Route path="/rooms/:id" element={<RoomPage />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/register" element={<Auth register />} />
          <Route
            path="/bookings"
            element={
              <Protect roles={["tenant", "owner", "admin"]}>
                <Bookings />
              </Protect>
            }
          />
          <Route
            path="/owner"
            element={
              <Protect roles={["owner"]}>
                <Owner />
              </Protect>
            }
          />
          <Route
            path="/tenants/:id"
            element={
              <Protect roles={["owner", "admin"]}>
                <TenantPage />
              </Protect>
            }
          />
          <Route
            path="/admin"
            element={
              <Protect roles={["admin"]}>
                <Admin />
              </Protect>
            }
          />
          <Route
            path="*"
            element={
              <div className="empty">
                <h1>Страница не найдена</h1>
                <Link to="/">Вернуться в каталог</Link>
              </div>
            }
          />
        </Routes>
      </main>
      <footer>
        <b>arendo</b>
        <span>Место найдётся для каждой идеи.</span>
        <Link to="/">Найти пространство</Link>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
