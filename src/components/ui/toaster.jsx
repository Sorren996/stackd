import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

/**
 * The older banner renderer, still used by the sign-up screens.
 *
 * The messages now live INSIDE the single fixed viewport. Before, they were
 * children of one `fixed` provider while a second `fixed` viewport sat beside
 * them, so every message was laid out by a box that knew nothing about the safe
 * area or the app header.
 */
export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      <ToastViewport>
        {toasts.map(function ({ id, title, description, action, ...props }) {
          return (
            <Toast key={id} {...props}>
              <div className="grid min-w-0 gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
              {action}
              <ToastClose />
            </Toast>
          );
        })}
      </ToastViewport>
    </ToastProvider>
  );
}