// Stable digit rails: a scroll frame only changes text, never React state.
export default function updateGlucoseTicker(root, value, animate = false) {
  if (!root) return;
  const text = String(value ?? ''), previous = root.dataset.value ?? '';
  if (!animate) root.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
  if (text === previous) return;
  root.dataset.value = text;
  const slide = animate && previous.length === text.length && Number.isFinite(Number(text))
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rising = Number(text) > Number(previous);
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
    rail.getAnimations().forEach(animation => animation.cancel());
    rail.firstElementChild.textContent = digit;
    rail.lastElementChild.textContent = previous[index] ?? '';
    rail.lastElementChild.style.top = rising ? '-100%' : '100%';
    if (slide && previous[index] !== digit) {
      rail.style.willChange = 'transform';
      const animation = rail.animate([{ transform: `translateY(${rising ? '100%' : '-100%'})` }, { transform: 'translateY(0)' }],
        { duration: 280, easing: 'cubic-bezier(.32,.72,.25,1)' });
      animation.onfinish = animation.oncancel = () => { rail.style.willChange = 'auto'; };
    }
  });
}