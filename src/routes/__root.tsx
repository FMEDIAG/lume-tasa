import { createRootRoute, Outlet, ScrollRestoration } from "@tanstack/react-router";
import "../app.css";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      <Outlet />
      <ScrollRestoration />
    </div>
  );
}
