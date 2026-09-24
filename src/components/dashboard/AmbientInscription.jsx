/**
 * Decorative ambient inscription — a handwritten "You're doing better than
 * you think" image placed at the bottom of the Dashboard as inert background
 * art. Not a card: no container, no border, no shadow — just the image
 * floating on the sandstone canvas with breathing room above and below.
 *
 * Fully inert: pointer-events disabled, dragging disabled, user-select
 * disabled, no context menu, no hover states. Behaves like wallpaper.
 */

const IMAGE_URL =
  "https://base44.app/api/apps/6a1b93f234a8611ee1595134/files/mp/public/6a1b93f234a8611ee1595134/2129f587c_youre-doing-better-than-you-think.png";

export default function AmbientInscription() {
  return (
    <div
      className="flex w-full justify-center px-4 pt-10 pb-6"
      aria-hidden="true"
      style={{ pointerEvents: "none" }}
    >
      <img
        src={IMAGE_URL}
        alt=""
        draggable={false}
        style={{
          maxWidth: "260px",
          width: "100%",
          height: "auto",
          pointerEvents: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          WebkitUserDrag: "none",
        }}
        onError={(e) => {
          // Hide gracefully if the asset ever fails — never show a broken icon.
          e.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}