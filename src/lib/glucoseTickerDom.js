// Stable digit rails: a scroll frame only changes text, never React state.
export default function updateGlucoseTicker(root, value, animate = false) {
  if (!root) return;
  const text = String(value ?? ''), previous = root.dataset.value ?? '';
  const slide = animate && previous.length === text.length && Number.isFinite(Number(text))
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!slide) root.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
  if (text === previous) return;
  root.dataset.value = text;
  // One coin flip per update, shared by every digit and its parked glyph.
  const rollUp = animate && Math.random() < 0.5;
  while (root.children.length > text.length) root.lastElementChild.remove();
  [...text].forEach((digit, index) => {
    let slot = root.children[index];
    if (!slot) {
      slot = document.createElement('span');
      slot.style.cssText = 'display:inline-block;position:relative;overflow:hidden;height:1em;line-height:1;vertical-align:top;font-variant-numeric:tabular-nums';
      const rail = document.createElement('span');
      rail.style.cssText = 'display:block;position:relative;height:1em;transform:translateY(0)';
      const current = document.createElement('span'), outgoing = document.createElement('span');
      current.style.cssText = 'display:block;text-align:center;height:1em';
      outgoing.style.cssText = 'position:absolute;left:0;right:0;text-align:center;height:1em';
      outgoing.setAttribute('aria-hidden', 'true');
      rail.append(current, outgoing); slot.append(rail); root.append(slot);
    }
    const rail = slot.firstElementChild;
    slot.style.width = /\d/.test(digit) ? '1ch' : '0.4ch';
    if (rail.firstElementChild.textContent === digit) return;
    const running = rail.getAnimations();
    let outgoing = previous[index] ?? '', start = `${rollUp ? 100 : -100}%`;
    if (slide && running.length) {
      // Capture the visible glyph BEFORE cancelling. Rebase that glyph onto
      // the outgoing slot without moving it, even on a direction reversal.
      const height = slot.getBoundingClientRect().height;
      const y = new DOMMatrixReadOnly(getComputedStyle(rail).transform).m42;
      const outgoingY = y + (rail.lastElementChild.style.top === '-100%' ? -height : height);
      const keepOutgoing = Math.abs(outgoingY) < Math.abs(y);
      outgoing = (keepOutgoing ? rail.lastElementChild : rail.firstElementChild).textContent;
      start = `${(keepOutgoing ? outgoingY : y) + (rollUp ? height : -height)}px`;
    }
    running.forEach(animation => {
      animation.onfinish = animation.oncancel = null;
      animation.cancel();
    });
    rail.style.willChange = 'auto';
    rail.firstElementChild.textContent = digit;
    rail.lastElementChild.textContent = outgoing;
    rail.lastElementChild.style.top = rollUp ? '-100%' : '100%';
    if (slide && previous[index] !== digit) {
      rail.style.willChange = 'transform';
      const animation = rail.animate([{ transform: `translateY(${start})` }, { transform: 'translateY(0)' }],
        { duration: 280, easing: 'cubic-bezier(.32,.72,.25,1)' });
      animation.onfinish = animation.oncancel = () => { rail.style.willChange = 'auto'; };
    }
  });
}