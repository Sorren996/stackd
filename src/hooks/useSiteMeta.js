import { useEffect } from "react";

/**
 * Route-specific title and description for the public pages, so each one reads
 * correctly in a search result or a shared link. The previous values are put
 * back when the visitor moves on.
 */
export default function useSiteMeta(title, description) {
  useEffect(() => {
    const previousTitle = document.title;
    const tag = document.querySelector('meta[name="description"]');
    const previousDescription = tag?.getAttribute("content") ?? "";

    if (title) document.title = title;
    if (description && tag) tag.setAttribute("content", description);

    return () => {
      if (title) document.title = previousTitle;
      if (description && tag) tag.setAttribute("content", previousDescription);
    };
  }, [title, description]);
}