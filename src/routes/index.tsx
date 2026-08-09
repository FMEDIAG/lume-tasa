import { createFileRoute } from "@tanstack/react-router";
import { ValuationWorkspace } from "@/components/valuation/ValuationWorkspace";

export const Route = createFileRoute("/")({
  component: ValuationWorkspace,
});
