/**
 * resonator.js — ResonantOS Visual Guide Layer
 *
 * Injected into the page alongside content.js. Provides visual overlays
 * to guide users through page interactions: highlights, arrows, spotlights,
 * numbered step badges, and one-command clear.
 *
 * All overlays use CSS animations — no JS animation loops.
 * All elements carry data-resonator for easy cleanup.
 * Z-index: 999999 (above everything except browser chrome).
 */

(function () {
  'use strict';

  const DATA_ATTR = 'data-resonator';
  const STYLE_ID = 'resonator-styles';
  const COLOR_GREEN = '#14F195';
  const COLOR_PURPLE = '#9945FF';

  // ── Inject keyframe + helper styles once ────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @keyframes resonator-pulse {
        0%   { box-shadow: 0 0 0 0   rgba(20,241,149,0.75); }
        70%  { box-shadow: 0 0 0 14px rgba(20,241,149,0); }
        100% { box-shadow: 0 0 0 0   rgba(20,241,149,0); }
      }
      @keyframes resonator-pulse-purple {
        0%   { box-shadow: 0 0 0 0   rgba(153,69,255,0.75); }
        70%  { box-shadow: 0 0 0 14px rgba(153,69,255,0); }
        100% { box-shadow: 0 0 0 0   rgba(153,69,255,0); }
      }
      @keyframes resonator-bob {
        0%, 100% { transform: translateY(0);   }
        50%       { transform: translateY(-7px); }
      }
      @keyframes resonator-fadein {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes resonator-step-pop {
        0%   { transform: scale(0.4); opacity: 0; }
        80%  { transform: scale(1.15); }
        100% { transform: scale(1);   opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Element finder ───────────────────────────────────────────────────────────

  function findElement(selector, text) {
    // 1. CSS selector
    if (selector) {
      try {
        const el = document.querySelector(selector);
        if (el) return el;
      } catch (_) { /* bad selector — fall through */ }
    }
    // 2. Visible text search
    if (text) {
      const needle = text.toLowerCase().trim();
      const CANDIDATES = 'button, a, [role="button"], input, select, textarea, ' +
        'h1, h2, h3, h4, h5, label, span, div, p, li, summary';
      const els = Array.from(document.querySelectorAll(CANDIDATES));
      return els.find((el) => {
        const t = (
          el.textContent ||
          el.value ||
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          ''
        ).toLowerCase().trim();
        return t.includes(needle) || needle.includes(t);
      }) || null;
    }
    return null;
  }

  // ── Clear all overlays ───────────────────────────────────────────────────────

  function clearAll() {
    // Remove injected overlay divs/svgs
    document.querySelectorAll(`[${DATA_ATTR}]`).forEach((el) => {
      const type = el.getAttribute(DATA_ATTR);
      if (type === 'highlight') {
        // Restore target element's original styles
        const saved = el._resonatorStyle;
        el.removeAttribute(DATA_ATTR);
        if (saved !== undefined) {
          el.setAttribute('style', saved);
        }
        delete el._resonatorStyle;
      } else {
        el.remove();
      }
    });
    // Nuke any leftover SVG overlays
    document.querySelectorAll('#resonator-svg').forEach((el) => el.remove());
  }

  // ── Highlight ────────────────────────────────────────────────────────────────

  function doHighlight({ selector, text, color, duration }) {
    const target = findElement(selector, text || selector);
    if (!target) {
      return { ok: false, error: `Resonator: no element matched selector="${selector || ''}" text="${text || ''}"` };
    }

    // Save original inline style so we can restore it
    target._resonatorStyle = target.getAttribute('style') || '';
    target.setAttribute(DATA_ATTR, 'highlight');

    const c = color || COLOR_GREEN;
    const isPurple = c === COLOR_PURPLE || c === '#9945ff';
    const pulse = isPurple ? 'resonator-pulse-purple' : 'resonator-pulse';

    target.style.outline = `3px solid ${c}`;
    target.style.outlineOffset = '2px';
    target.style.borderRadius = '4px';
    target.style.animation = `${pulse} 1.5s ease-in-out infinite`;
    target.style.position = target.style.position || 'relative';
    target.style.zIndex = '999990';

    target.scrollIntoView({ block: 'center', behavior: 'smooth' });

    const ms = (typeof duration === 'number' && duration > 0) ? duration : 3000;
    const timer = setTimeout(() => {
      if (target.getAttribute(DATA_ATTR) === 'highlight') {
        const saved = target._resonatorStyle;
        target.removeAttribute(DATA_ATTR);
        if (saved !== undefined) target.setAttribute('style', saved);
        delete target._resonatorStyle;
      }
    }, ms);

    // Store timer on element so clearAll can cancel it
    target._resonatorTimer = timer;

    return { ok: true };
  }

  // ── Arrow ────────────────────────────────────────────────────────────────────

  function doArrow({ selector, text, label, duration }) {
    const target = findElement(selector, text || selector);
    if (!target) return { ok: false, error: 'Resonator: no element found for arrow' };

    target.scrollIntoView({ block: 'center', behavior: 'smooth' });

    // Position after scroll settles
    const SETTLE = 420;
    setTimeout(() => {
      const rect = target.getBoundingClientRect();
      const sx = window.scrollX || window.pageXOffset;
      const sy = window.scrollY || window.pageYOffset;

      const wrapper = document.createElement('div');
      wrapper.setAttribute(DATA_ATTR, 'arrow');
      wrapper.style.cssText = [
        'position:absolute',
        `left:${Math.round(rect.left + sx + rect.width / 2 - 20)}px`,
        `top:${Math.round(rect.top + sy - 70)}px`,
        'z-index:999999',
        'pointer-events:none',
        'text-align:center',
        'animation:resonator-bob 1s ease-in-out infinite, resonator-fadein 0.3s ease',
        'filter:drop-shadow(0 0 8px rgba(20,241,149,0.8))',
      ].join(';');

      if (label) {
        const lbl = document.createElement('div');
        lbl.textContent = label;
        lbl.style.cssText = [
          'font-family:sans-serif',
          'font-size:12px',
          'font-weight:700',
          'color:#000',
          'background:#14F195',
          'border-radius:4px',
          'padding:2px 10px',
          'margin-bottom:4px',
          'white-space:nowrap',
          'display:inline-block',
        ].join(';');
        wrapper.appendChild(lbl);
      }

      const arrow = document.createElement('div');
      arrow.textContent = '▼';
      arrow.style.cssText = 'font-size:30px;color:#14F195;line-height:1;';
      wrapper.appendChild(arrow);

      document.body.appendChild(wrapper);

      const ms = (typeof duration === 'number' && duration > 0) ? duration : 5000;
      const autoRemove = setTimeout(() => wrapper.remove(), ms);

      // Click anywhere dismisses
      const dismiss = () => {
        clearTimeout(autoRemove);
        wrapper.remove();
        document.removeEventListener('click', dismiss);
      };
      setTimeout(() => document.addEventListener('click', dismiss), 300);
    }, SETTLE);

    return { ok: true };
  }

  // ── Spotlight ────────────────────────────────────────────────────────────────

  function doSpotlight({ selector, text, label }) {
    const target = findElement(selector, text || selector);
    if (!target) return { ok: false, error: 'Resonator: no element found for spotlight' };

    target.scrollIntoView({ block: 'center', behavior: 'smooth' });

    setTimeout(() => {
      const rect = target.getBoundingClientRect();
      const pad = 14;

      // Clickable backdrop (transparent — SVG draws the dim)
      const backdrop = document.createElement('div');
      backdrop.setAttribute(DATA_ATTR, 'spotlight');
      backdrop.style.cssText = [
        'position:fixed',
        'top:0;left:0;right:0;bottom:0',
        'z-index:999997',
        'cursor:pointer',
        'animation:resonator-fadein 0.3s ease',
      ].join(';');

      // SVG with mask (dim everything except spotlight hole)
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'resonator-svg';
      svg.setAttribute(DATA_ATTR, 'spotlight');
      svg.style.cssText = [
        'position:fixed;top:0;left:0;width:100%;height:100%',
        'pointer-events:none;z-index:999998',
        'animation:resonator-fadein 0.3s ease',
      ].join(';');

      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
      clipPath.id = 'resonator-clip';

      // Full screen rect MINUS the spotlight hole = dim region
      // We'll use a different approach: use a mask
      const mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
      mask.id = 'resonator-mask';

      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
      bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%');
      bg.setAttribute('fill', 'white');

      const hole = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hole.setAttribute('x', String(rect.left - pad));
      hole.setAttribute('y', String(rect.top - pad));
      hole.setAttribute('width', String(rect.width + pad * 2));
      hole.setAttribute('height', String(rect.height + pad * 2));
      hole.setAttribute('rx', '6');
      hole.setAttribute('fill', 'black');

      mask.appendChild(bg);
      mask.appendChild(hole);
      defs.appendChild(mask);
      defs.appendChild(clipPath);
      svg.appendChild(defs);

      // Dim overlay
      const dim = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      dim.setAttribute('x', '0'); dim.setAttribute('y', '0');
      dim.setAttribute('width', '100%'); dim.setAttribute('height', '100%');
      dim.setAttribute('fill', 'rgba(0,0,0,0.72)');
      dim.setAttribute('mask', 'url(#resonator-mask)');
      svg.appendChild(dim);

      // Glow border around hole
      const glow = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      glow.setAttribute('x', String(rect.left - pad));
      glow.setAttribute('y', String(rect.top - pad));
      glow.setAttribute('width', String(rect.width + pad * 2));
      glow.setAttribute('height', String(rect.height + pad * 2));
      glow.setAttribute('rx', '6');
      glow.setAttribute('fill', 'none');
      glow.setAttribute('stroke', COLOR_GREEN);
      glow.setAttribute('stroke-width', '2.5');
      svg.appendChild(glow);

      document.body.appendChild(backdrop);
      document.body.appendChild(svg);

      if (label) {
        const lbl = document.createElement('div');
        lbl.textContent = label;
        lbl.setAttribute(DATA_ATTR, 'spotlight');
        const lblTop = Math.max(6, rect.top - pad - 38);
        lbl.style.cssText = [
          'position:fixed',
          `left:${rect.left - pad}px`,
          `top:${lblTop}px`,
          'background:#14F195',
          'color:#000',
          'font-family:sans-serif',
          'font-weight:700',
          'font-size:13px',
          'padding:4px 12px',
          'border-radius:4px',
          'z-index:999999',
          'pointer-events:none',
          'animation:resonator-fadein 0.3s ease',
        ].join(';');
        document.body.appendChild(lbl);
      }

      // Dismiss on click
      const dismiss = () => {
        backdrop.remove();
        svg.remove();
        document.querySelectorAll(`[${DATA_ATTR}="spotlight"]`).forEach((el) => el.remove());
        document.removeEventListener('click', dismiss);
      };
      backdrop.addEventListener('click', dismiss);
    }, 420);

    return { ok: true };
  }

  // ── Step badges ──────────────────────────────────────────────────────────────

  function doStep({ steps }) {
    if (!Array.isArray(steps) || !steps.length) {
      return { ok: false, error: 'Resonator: no steps provided' };
    }

    let placed = 0;

    steps.forEach((step, idx) => {
      const target = findElement(step.selector, step.text || step.selector);
      if (!target) return;

      placed++;
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

      setTimeout(() => {
        const rect = target.getBoundingClientRect();
        const sx = window.scrollX || window.pageXOffset;
        const sy = window.scrollY || window.pageYOffset;

        const badge = document.createElement('div');
        badge.setAttribute(DATA_ATTR, 'step');
        badge.style.cssText = [
          'position:absolute',
          `left:${Math.round(rect.left + sx - 18)}px`,
          `top:${Math.round(rect.top + sy - 18)}px`,
          'z-index:999999',
          'width:30px;height:30px',
          'border-radius:50%',
          `background:${COLOR_PURPLE}`,
          'color:#fff',
          'font-family:sans-serif',
          'font-weight:900',
          'font-size:14px',
          'display:flex;align-items:center;justify-content:center',
          `box-shadow:0 0 0 3px rgba(153,69,255,0.35)`,
          `animation:resonator-step-pop 0.4s ease ${idx * 0.18}s both`,
          'cursor:default',
        ].join(';');
        badge.textContent = String(idx + 1);

        if (step.label) {
          badge.title = step.label;

          const tooltip = document.createElement('div');
          tooltip.textContent = step.label;
          tooltip.style.cssText = [
            'position:absolute',
            'left:38px',
            'top:50%;transform:translateY(-50%)',
            'background:rgba(0,0,0,0.88)',
            `border:1px solid ${COLOR_PURPLE}`,
            'color:#fff',
            'font-size:11px',
            'font-family:sans-serif',
            'font-weight:600',
            'padding:3px 10px',
            'border-radius:4px',
            'white-space:nowrap',
            'pointer-events:none',
            'opacity:0;transition:opacity 0.2s',
            'z-index:1000000',
          ].join(';');
          badge.appendChild(tooltip);
          badge.addEventListener('mouseenter', () => { tooltip.style.opacity = '1'; });
          badge.addEventListener('mouseleave', () => { tooltip.style.opacity = '0'; });
        }

        document.body.appendChild(badge);
      }, idx * 180);
    });

    return { ok: placed > 0, placed, total: steps.length };
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  window.Resonator = {
    highlight: doHighlight,
    arrow: doArrow,
    spotlight: doSpotlight,
    step: doStep,
    clear: clearAll,
  };

  injectStyles();

})();
