import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      <Outlet />
    </div>
  );
}
