/** Install independent, manually controlled carousels in a document or rendered fragment.
 * @param {Document | HTMLElement | null} root
 */
export function installCarouselRuntime(root = document) {
  if (!root) return () => {};
  const doc = root.ownerDocument || root;
  const style = doc.createElement('style');
  style.textContent = `
    [data-editor-carousel]{display:block;border:1px solid #dce3ee;border-radius:12px;padding:16px;margin:24px 0;max-width:100%;box-sizing:border-box}
    [data-editor-carousel] [data-carousel-slide]{margin:0}
    [data-editor-carousel] [data-carousel-slide][hidden]{display:none!important}
    [data-editor-carousel] .editor-carousel-frame{height:clamp(220px,45vw,480px);width:100%;background:#f5f7fb;touch-action:pan-y;overflow:hidden}
    [data-editor-carousel] .editor-carousel-frame img{display:block;width:100%!important;height:100%!important;max-width:100%;max-height:100%;margin:0;object-fit:contain;object-position:center;user-select:none}
    [data-editor-carousel] figcaption{min-height:1.5em;margin:10px 0;white-space:pre-wrap;overflow-wrap:anywhere;color:#65758b;text-align:center;font-size:14px}
    [data-editor-carousel] .editor-carousel-controls{display:flex;gap:16px;align-items:center;justify-content:center}
    [data-editor-carousel] button{min-width:44px;min-height:44px;border:1px solid #ccd6e4;border-radius:8px;background:white;color:#183b6c;cursor:pointer;font-size:20px}
    [data-editor-carousel] button:disabled{opacity:.4;cursor:default}
    [data-editor-carousel] button:focus-visible,[data-editor-carousel]:focus-visible{outline:2px solid #326dff;outline-offset:3px}
  `;
  doc.head.append(style);
  const attached = new Map();
  function scan() {
    for (const [element, cleanup] of attached) if (!root.contains(element)) { cleanup(); attached.delete(element); }
    root.querySelectorAll('[data-editor-carousel]').forEach(element => {
      if (attached.has(element)) return;
      const slides = Array.from(element.querySelectorAll('[data-carousel-slide]'));
      if (!slides.length) return;
      const counter = element.querySelector('[data-carousel-counter]');
      let index = 0, touch = null;
      const show = value => {
        index = ((value % slides.length) + slides.length) % slides.length;
        slides.forEach((slide, i) => { slide.hidden = i !== index; });
        if (counter) counter.textContent = (index + 1) + ' / ' + slides.length;
      };
      const click = event => {
        const button = event.target.closest('[data-carousel-step]');
        if (!button || button.closest('[data-editor-carousel]') !== element || button.disabled) return;
        show(index + Number(button.getAttribute('data-carousel-step')));
      };
      const keydown = event => {
        if (event.target.closest('input,textarea,select,button,[contenteditable=true]')) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); show(index + (event.key === 'ArrowRight' ? 1 : -1)); }
      };
      const start = event => { touch = event.touches.length === 1 ? {x:event.touches[0].clientX,y:event.touches[0].clientY} : null; };
      const end = event => {
        if (!touch || !event.changedTouches.length) return;
        const dx = event.changedTouches[0].clientX - touch.x, dy = event.changedTouches[0].clientY - touch.y; touch = null;
        if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.2) show(index + (dx < 0 ? 1 : -1));
      };
      const cancel = () => { touch = null; };
      element.addEventListener('click', click);
      element.addEventListener('keydown', keydown);
      element.addEventListener('touchstart', start, {passive:true});
      element.addEventListener('touchend', end, {passive:true});
      element.addEventListener('touchcancel', cancel);
      show(0);
      attached.set(element, () => {
        element.removeEventListener('click', click); element.removeEventListener('keydown', keydown);
        element.removeEventListener('touchstart', start); element.removeEventListener('touchend', end); element.removeEventListener('touchcancel', cancel);
      });
    });
  }
  const observer = new MutationObserver(scan);
  observer.observe(root, {childList:true,subtree:true}); scan();
  return () => { observer.disconnect(); for (const cleanup of attached.values()) cleanup(); attached.clear(); style.remove(); };
}
