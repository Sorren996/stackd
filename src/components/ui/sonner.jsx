"use client";
import { useEffect } from "react";
import { Toaster as Sonner } from "sonner";
import {
  BANNER_SONNER_OFFSET,
  reportBannerInsetsOnce,
} from "@/lib/notificationPlacement";

/**
 * App-wide banner renderer.
 *
 * Placement comes from notificationPlacement, never from a bare `position`:
 * Sonner's default top position is 16–32px from the top of the viewport, which
 * on a notched iPhone is inside the clock and the Dynamic Island.
 *
 * `expand` is what stops a second message from landing on the first one. Sonner
 * normally collapses a stack, drawing older messages underneath the newest with
 * only a sliver visible — which reads on screen as two banners overlapping. With
 * expansion they take their own height with a gap between them.
 *
 * Text is explicitly wrapping (Sonner's own rules are attribute selectors, so
 * the utilities that must win carry Tailwind's important modifier).
 */
const Toaster = ({ ...props }) => {
  useEffect(() => {
    reportBannerInsetsOnce();
  }, []);

  return (
    <Sonner
      position="top-center"
      theme="light"
      className="toaster group"
      offset={BANNER_SONNER_OFFSET}
      mobileOffset={BANNER_SONNER_OFFSET}
      expand
      gap={10}
      visibleToasts={3}
      closeButton
      containerAriaLabel="Stackd messages"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:items-start group-[.toaster]:rounded-2xl group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:bg-card group-[.toaster]:px-4 group-[.toaster]:py-3.5 group-[.toaster]:pr-9 group-[.toaster]:text-foreground group-[.toaster]:shadow-lg",
          title:
            "group-[.toast]:!whitespace-normal group-[.toast]:!break-words group-[.toast]:!font-semibold group-[.toast]:!leading-snug",
          description:
            "group-[.toast]:!whitespace-normal group-[.toast]:!break-words group-[.toast]:!leading-relaxed group-[.toast]:!text-muted-foreground",
          closeButton:
            "group-[.toast]:!border-border group-[.toast]:!bg-card group-[.toast]:!text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };