import * as React from "react";
import { cva } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BANNER_MAX_HEIGHT,
  BANNER_SIDE_LEFT,
  BANNER_SIDE_RIGHT,
  BANNER_TOP,
} from "@/lib/notificationPlacement";

// Inert wrapper. This used to be a `fixed top-0` box with its own padding, and
// the viewport below it was a SECOND `fixed top-0` box — so a message was laid
// out by a container that knew nothing about the safe area or the header, and an
// empty fixed layer sat beside it. One positioned surface is enough.
//
// It keeps no pointer-events rule of its own: `pointer-events: none` here would
// be inherited by the fixed viewport below, which would stop that stack from
// being scrolled by touch. As a plain block whose only child is out of flow, it
// has zero height and intercepts nothing by itself.
const ToastProvider = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={className} {...props} />
));
ToastProvider.displayName = "ToastProvider";

// The single fixed surface for this renderer, using the SAME placement as the
// Sonner toaster (notificationPlacement): real safe-area inset, then the fixed
// header bar, then a small gap. Sides follow the inset so a notched phone held
// in landscape cannot push text under the cut-out, and the stack is capped well
// above the floating dock and the home indicator.
//
// It is deliberately NOT pointer-events-none: an empty stack has zero height and
// intercepts nothing, while a stack tall enough to reach its cap has to stay
// scrollable by touch, which needs the events on this container. Individual
// messages are pointer-events-auto, so their close buttons stay tappable.
const ToastViewport = React.forwardRef(({ className, style, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("fixed inset-x-0 z-[100] flex flex-col gap-2.5", className)}
    style={{
      top: BANNER_TOP,
      maxHeight: BANNER_MAX_HEIGHT,
      overflowY: "auto",
      paddingLeft: BANNER_SIDE_LEFT,
      paddingRight: BANNER_SIDE_RIGHT,
      ...style,
    }}
    {...props}
  />
));
ToastViewport.displayName = "ToastViewport";

// Entering travels 8px, not a full height: a full-height slide starts above the
// container's top edge, which is the status area, so the text would pass through
// the clock on its way in. It fades in and rises from just below its own slot
// instead. Exiting stays horizontal, off to the right, which never crosses the
// top edge.
const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-start justify-between gap-3 overflow-hidden whitespace-normal break-words rounded-2xl border border-border bg-card px-4 py-3.5 pr-9 text-sm text-foreground shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-2",
  {
    variants: {
      variant: {
        default: "",
        destructive:
          "destructive group border-destructive bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Toast = React.forwardRef(({ className, variant, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
});
Toast.displayName = "Toast";

const ToastAction = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive",
      className
    )}
    {...props}
  />
));
ToastAction.displayName = "ToastAction";

const ToastClose = React.forwardRef(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      // Always visible: a touch screen never hovers, so the previous
      // hover-only close control was unreachable on a phone.
      "absolute right-1.5 top-1.5 rounded-full p-2 text-[#746959] transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring group-[.destructive]:text-[#fdf9f2]",
      className
    )}
    aria-label="Dismiss message"
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </button>
));
ToastClose.displayName = "ToastClose";

const ToastTitle = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
));
ToastTitle.displayName = "ToastTitle";

const ToastDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm opacity-90", className)}
    {...props}
  />
));
ToastDescription.displayName = "ToastDescription";

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};