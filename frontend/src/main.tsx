import "@fontsource-variable/onest";
import { CheckIcon, SignOutIcon, WarningIcon } from "@phosphor-icons/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig, motion } from "motion/react";
import { useOverlayScrollbars } from "overlayscrollbars-react";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Toaster, toast } from "sonner";
import { post, setSession } from "./api";
import Admin from "./pages/Admin";
import Auth from "./pages/Auth";
import Bookings from "./pages/Bookings";
import Catalog from "./pages/Catalog";
import Manage from "./pages/Manage";
import Moderation from "./pages/Moderation";
import Owner from "./pages/Owner";
import RoomPage from "./pages/RoomPage";
import TenantPage from "./pages/TenantPage";
import { client } from "./query";
import ThemeToggle from "./ThemeToggle";
import { initials, Protect, roleLabels, useSession } from "./ui";
import "overlayscrollbars/overlayscrollbars.css";
import "./style.css";

function useMacScrollbar() {
  const [initialize] = useOverlayScrollbars({
    options: {
      scrollbars: {
        theme: "os-theme-arendo",
        autoHide: "scroll",
        autoHideDelay: 600,
        clickScroll: true,
      },
    },
    defer: true,
  });
  useEffect(() => {
    initialize(document.body);
  }, [initialize]);
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="9" fill="var(--accent)" />
      <path
        d="M8 21V13a6 6 0 0 1 12 0v8"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="14" cy="17" r="2" fill="#fff" />
    </svg>
  );
}

function Header() {
  const s = useSession();
  const nav = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  async function logout() {
    try {
      await post("/auth/logout");
      setSession(null);
      client.clear();
      nav("/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось выйти.");
    }
  }
  const links = [
    { to: "/", label: "Каталог", visible: true },
    {
      to: "/bookings",
      label: s?.user.role === "tenant" ? "Мои аренды" : "Аренды",
      visible: Boolean(s),
    },
    {
      to: "/owner",
      label: "Мои помещения",
      visible: s?.user.role === "owner",
    },
    {
      to: "/moderation",
      label: "Арендаторы",
      visible: s?.user.role === "owner" || s?.user.role === "admin",
    },
    {
      to: "/admin",
      label: "Администрирование",
      visible: s?.user.role === "admin",
    },
  ];
  return (
    <header className={scrolled ? "topbar scrolled" : "topbar"}>
      <div className="topbar-inner">
        <Link className="brand" to="/">
          <Logo />
          arendo
        </Link>
        <nav className="menu" aria-label="Разделы">
          {links
            .filter((link) => link.visible)
            .map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === "/"}>
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span className="menu-pill" layoutId="menu-pill" />
                    )}
                    <span>{link.label}</span>
                  </>
                )}
              </NavLink>
            ))}
        </nav>
        <div className="theme-slot">
          <ThemeToggle />
        </div>
        {s ? (
          <div className="account">
            <span className="avatar" aria-hidden>
              {initials(s.user.fullName)}
            </span>
            <span className="account-name">
              <b>{s.user.fullName}</b>
              <small>{roleLabels[s.user.role]}</small>
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Выйти"
              title="Выйти"
              onClick={logout}
            >
              <SignOutIcon size={20} aria-hidden />
            </button>
          </div>
        ) : (
          <div className="account">
            <Link className="text-link register-link" to="/register">
              Регистрация
            </Link>
            <Link className="button" to="/login">
              Войти
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

function Footer() {
  const s = useSession();
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>
          <Link className="brand" to="/">
            <Logo />
            arendo
          </Link>
          <p>Залы, студии, коворкинги и склады в аренду по часам и суткам.</p>
        </div>
        <nav aria-label="Арендаторам">
          <h2>Арендаторам</h2>
          <Link to="/">Все помещения</Link>
          <Link to="/bookings">Мои аренды</Link>
          {!s && <Link to="/login">Вход</Link>}
        </nav>
        <nav aria-label="Владельцам">
          <h2>Владельцам</h2>
          {!s && <Link to="/register">Сдать помещение</Link>}
          <Link to="/owner">Кабинет владельца</Link>
        </nav>
      </div>
      <p className="footer-base">© 2026 Arendo</p>
    </footer>
  );
}

function App() {
  useMacScrollbar();
  const { pathname } = useLocation();
  // Новая страница открывается с начала.
  // biome-ignore lint/correctness/useExhaustiveDependencies: реагируем на смену пути
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <>
      <Header />
      <motion.main
        key={pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
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
            path="/owner/rooms/:id"
            element={
              <Protect roles={["owner"]}>
                <Manage />
              </Protect>
            }
          />
          <Route
            path="/moderation"
            element={
              <Protect roles={["owner", "admin"]}>
                <Moderation />
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
                <Link className="button" to="/">
                  Вернуться в каталог
                </Link>
              </div>
            }
          />
        </Routes>
      </motion.main>
      <Footer />
      <Toaster
        position="bottom-center"
        offset={24}
        duration={3200}
        icons={{
          success: <CheckIcon size={16} weight="bold" aria-hidden />,
          error: <WarningIcon size={16} weight="bold" aria-hidden />,
        }}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast: "toast",
            icon: "toast-icon",
            success: "toast-success",
            error: "toast-error",
          },
        }}
      />
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Не найден элемент #root.");
createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  </React.StrictMode>,
);
