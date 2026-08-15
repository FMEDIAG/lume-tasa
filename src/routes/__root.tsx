import { createRootRoute, Outlet, ScrollRestoration } from "@tanstack/react-router";
import styleCss from "../style.css?url";

export const Route = createRootRoute({
  head: () => ({
    links: [
      { rel: "stylesheet", href: styleCss },
    ],
  }),
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
