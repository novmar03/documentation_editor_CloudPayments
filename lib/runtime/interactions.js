// Shared by the editor preview, exported HTML and the documentation site.
/** @param {Document | HTMLElement} root */
export function installInteractions(root = document) {
  const carousels = new Map();
  const style = document.createElement('style');
  style.textContent = '.doc-carousel{border:1px solid #dbe3ef;border-radius:12px;padding:12px;margin:20px 0}.doc-carousel [data-slide][hidden]{display:none!important}.doc-carousel img{display:block;max-width:100%;max-height:480px;object-fit:contain;margin:auto}.doc-carousel nav{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:12px}.doc-carousel button{border:1px solid #ccd6e4;border-radius:6px;padding:6px 12px;background:white;color:#183b6c;cursor:pointer}.doc-carousel button[aria-current=true]{background:#326dff;color:white}.doc-anchor{scroll-margin-top:100px}';
  document.head.append(style);
  function scan() {
    for (const [el, stop] of carousels) if (!root.contains(el)) { stop(); carousels.delete(el); }
    root.querySelectorAll('[data-doc-carousel]').forEach(el => {
      if (carousels.has(el)) return;
      const slides = [...el.querySelectorAll('[data-slide]')];
      const buttons = [...el.querySelectorAll('[data-slide-to]')];
      let index = 0, paused = false, hover = false;
      const show = value => {
        index = (value + slides.length) % slides.length;
        slides.forEach((slide, i) => { slide.hidden = i !== index; });
        buttons.forEach((b, i) => b.setAttribute('aria-current', String(i === index)));
      };
      const click = e => {
        const b = e.target.closest('button'); if (!b || !el.contains(b)) return;
        if (b.hasAttribute('data-slide-to')) show(Number(b.dataset.slideTo));
        if (b.hasAttribute('data-slide-step')) show(index + Number(b.dataset.slideStep));
        if (b.hasAttribute('data-slide-pause')) { paused = !paused; b.textContent = paused ? 'Продолжить' : 'Пауза'; b.setAttribute('aria-pressed', String(paused)); }
      };
      const enter = () => { hover = true; }, leave = () => { hover = false; };
      el.addEventListener('click', click); el.addEventListener('mouseenter', enter); el.addEventListener('mouseleave', leave);
      const timer = setInterval(() => { if (slides.length > 1 && !paused && !hover && !document.hidden && !el.contains(document.activeElement)) show(index + 1); }, 3000);
      if (slides.length) show(0);
      carousels.set(el, () => { clearInterval(timer); el.removeEventListener('click', click); el.removeEventListener('mouseenter', enter); el.removeEventListener('mouseleave', leave); });
    });
  }
  // The offline site uses #/page@anchor; native documentation uses #anchor.
  function anchorClick(e) {
    const link = e.target.closest('a[href^="#"]'); if (!link || !root.contains(link)) return;
    const href = link.getAttribute('href'); if (!href || href === '#' || href.startsWith('#/')) return;
    let id; try { id = decodeURIComponent(href.slice(1)); } catch { return; }
    const target = [...root.querySelectorAll('[id]')].find(el => el.id === id); if (!target) return;
    e.preventDefault(); target.scrollIntoView({behavior:'smooth',block:'start'});
    if (location.hash.startsWith('#/')) history.replaceState(null, '', location.hash.split('@')[0] + '@' + encodeURIComponent(id));
    else if (!root.closest?.('.document-preview')) history.replaceState(null, '', '#' + encodeURIComponent(id));
  }
  root.addEventListener('click', anchorClick);
  const observer = new MutationObserver(scan); observer.observe(root, {childList:true,subtree:true}); scan();
  return () => { observer.disconnect(); root.removeEventListener('click', anchorClick); for (const stop of carousels.values()) stop(); style.remove(); };
}
