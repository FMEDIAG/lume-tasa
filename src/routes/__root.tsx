import { createRootRoute, Outlet, ScrollRestoration } from "@tanstack/react-router";
import { Meta, Scripts } from "@tanstack/start";
import type { ReactNode } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lume AI Valuation" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <Meta />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
