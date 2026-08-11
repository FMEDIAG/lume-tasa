import { createRootRoute, Outlet, ScrollRestoration } from "@tanstack/react-router";
import { Meta, Scripts } from "@tanstack/react-start";
import { Toaster } from "sonner";
import type { ReactNode } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Lume",
      },
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
    <html lang="es" className="dark">
      <head>
        <Meta />
      </head>
      <body className="min-h-screen font-sans antialiased">
        {children}
        <Toaster theme="dark" position="top-center" closeButton />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
