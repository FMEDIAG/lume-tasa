import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";

const lumeAlertVariants = cva(
  "relative w-full rounded-xl border px-4 py-3.5 text-sm transition-all duration-300 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        // Erro: Rojo coral com brilho
        error:
          "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 [&>svg]:text-red-500 [&>svg]:dark:text-red-400",
        // Sucesso: Esmeralda radiante
        success:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 [&>svg]:text-emerald-500 [&>svg]:dark:text-emerald-400",
        // Info/Default: Céu luminoso (azul LUME)
        info:
          "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 [&>svg]:text-sky-500 [&>svg]:dark:text-sky-400",
        // Aviso: Âmbar luxuoso
        warning:
          "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 [&>svg]:text-amber-500 [&>svg]:dark:text-amber-400",
        // Neutral: Conforme com o tema Lume
        default:
          "border-border/60 bg-card/50 text-foreground [&>svg]:text-muted-foreground",
      },
      prominence: {
        subtle: "border-opacity-20",
        normal: "border-opacity-30",
        prominent:
          "border-opacity-50 ring-1 shadow-lg [&>svg]:scale-110 font-medium",
      },
    },
    defaultVariants: {
      variant: "info",
      prominence: "normal",
    },
  }
);

interface LumeAlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof lumeAlertVariants> {
  icon?: React.ReactNode;
  showIcon?: boolean;
  title?: React.ReactNode;
}

const LumeAlert = React.forwardRef<HTMLDivElement, LumeAlertProps>(
  (
    {
      className,
      variant,
      prominence,
      icon,
      showIcon = true,
      title,
      children,
      ...props
    },
    ref
  ) => {
    const getDefaultIcon = () => {
      if (!showIcon) return null;
      if (icon) return icon;

      switch (variant) {
        case "error":
          return <AlertCircle className="h-4 w-4" />;
        case "success":
          return <CheckCircle2 className="h-4 w-4" />;
        case "warning":
          return <AlertTriangle className="h-4 w-4" />;
        case "info":
          return <Info className="h-4 w-4" />;
        default:
          return <MessageSquare className="h-4 w-4" />;
      }
    };

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(lumeAlertVariants({ variant, prominence }), className)}
        {...props}
      >
        <div className="flex gap-3">
          {showIcon && <div className="flex-shrink-0 mt-0.5">{getDefaultIcon()}</div>}
          <div className="flex-1 min-w-0">
            {title && (
              <h5 className="font-semibold mb-1 text-sm leading-none tracking-tight">
                {title}
              </h5>
            )}
            <div className="text-sm [&_p]:leading-relaxed [&_p]:mb-0">
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }
);
LumeAlert.displayName = "LumeAlert";

const LumeAlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />
));
LumeAlertDescription.displayName = "LumeAlertDescription";

export { LumeAlert, LumeAlertDescription };
