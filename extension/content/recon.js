/**
 * CrewForms recon recorder.
 *
 * A passive observer that runs in EVERY frame (the manifest injects it with
 * all_frames) and, while a recon session is armed, records how the form
 * actually behaves while someone — the captain or Claude in Chrome — fills it:
 *
 *   - a field inventory snapshot per frame (label, control type, options)
 *   - every interaction (focus/input/change/click), with isTrusted so human
 *     and automated input are distinguishable
 *   - dropdown overlays: the option strings actually rendered, verbatim, and
 *     which one was clicked — the signal that teaches per-site vocabulary
 *   - fields appearing/disappearing/changing required-ness, validation
 *     messages verbatim, and values that change with no user event (silent
 *     reverts)
 *
 * It never fills, never blocks, and never slows input: listeners are
 * capture-phase and passive, do no synchronous layout work, and stream to the
 * background worker in batches. Armed state lives in chrome.storage.local so
 * a frame reloaded by an ASP.NET postback resumes recording by itself — the
 * eNOAD passenger iframe is the whole reason this file exists.
 *
 * PII never leaves the page raw: free-text values are matched against a
 * redaction dictionary (sent by the side panel on arm) and recorded as tokens
 * like "≡ traveler[2].passportNumber", or reduced to a shape like "A########".
 * Option strings picked from dropdowns are site vocabulary, not PII, and are
 * kept verbatim.
 */
(() => {
  if (window.__crewformsRecon) return;
  window.__crewformsRecon = true;

  const FRAME = location.href;
  const IS_TOP = window === window.top;

  const FIELD_SELECTOR = 'input, select, textarea, mat-select, [role="combobox"], [role="listbox"]';
  const OVERLAY_SELECTOR =
    '.cdk-overlay-pane, .mat-select-panel, .mat-mdc-select-panel, .mat-autocomplete-panel, ' +
    '.mat-mdc-autocomplete-panel, .RadComboBoxDropDown, .rcbSlide, [role="listbox"], ul.dropdown-menu';
  const OPTION_SELECTOR = 'mat-option, .mat-option, .mat-mdc-option, [role="option"], .rcbItem, li';
  const VALIDATION_SELECTOR =
    'mat-error, .mat-error, .mat-mdc-form-field-error, [role="alert"], .field-validation-error, ' +
    '.validation-summary-errors, .rcbError, [id*="Validator"], .invalid-feedback, .error-message';
  // Tokenize these even if the redaction dictionary misses (typos, edits).
  const PII_LABEL = /name|passport|document\s*(number|no)|birth|address|phone|email|license|zip|postal/i;

  let session = null; // { id, startedAt, redact: [{path, value}] }
  let queue = [];
  let flushTimer = null;
  let observer = null;
  let sweepTimer = null;
  let lastInteraction = null;
  const lastValues = new WeakMap(); // control -> last value WE saw (event or sweep)
  const userTouched = new WeakSet(); // controls that received a user/agent event
  const knownVisible = new WeakMap(); // control -> last visibility bool

  // ---------------------------------------------------------------- helpers

  function isVisible(el) {
    // Only called from timers/snapshots, never from event handlers.
    if (!el.isConnected) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
  }

  /** Port of the side panel's 9-strategy findLabelFor, unchanged in spirit. */
  function findLabelFor(element) {
    const clean = (t) => t.trim().replace(/\*$/, '').trim();
    if (element.id) {
      const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label) return clean(label.textContent);
    }
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean)
        .join(' ');
      if (text) return clean(text);
    }
    const parentLabel = element.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll('input, select, textarea').forEach((i) => i.remove());
      const text = clean(clone.textContent);
      if (text) return text;
    }
    const formField = element.closest('mat-form-field, .mat-form-field, .mat-mdc-form-field');
    if (formField) {
      const matLabel = formField.querySelector('mat-label');
      if (matLabel) return clean(matLabel.textContent);
    }
    const formGroup = element.closest('.form-group, .form-row');
    if (formGroup) {
      const label = formGroup.querySelector('label, .control-label, .form-label');
      if (label) return clean(label.textContent);
    }
    let prev = element.previousElementSibling;
    while (prev) {
      if (prev.tagName === 'LABEL' || prev.classList.contains('label')) return clean(prev.textContent);
      prev = prev.previousElementSibling;
    }
    if (element.placeholder && element.placeholder !== '--Select--') return element.placeholder;
    if (element.name) {
      return element.name
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .trim()
        .replace(/^\w/, (c) => c.toUpperCase());
    }
    return null;
  }

  /** Slimmed detectComponentType — enough to tell a typeahead from a text box. */
  function controlType(el) {
    const tag = el.tagName.toLowerCase();
    const cls = String(el.className || '');
    const wrapper = el.closest('[class*="Rad"], [class*="k-"], [class*="mat-"], .ng-select');
    const wCls = wrapper ? String(wrapper.className || '') : '';
    if (cls.includes('rcbInput') || wCls.includes('RadComboBox')) return 'telerik-combobox';
    if (wCls.includes('RadDropDownList')) return 'telerik-dropdown';
    if (tag === 'mat-select' || cls.includes('mat-select')) return 'mat-select';
    if (el.getAttribute('aria-autocomplete') === 'list' || cls.includes('mat-autocomplete-trigger'))
      return 'mat-autocomplete';
    if (wCls.includes('k-combobox') || wCls.includes('k-dropdown')) return 'kendo';
    if (tag === 'ng-select' || cls.includes('ng-select')) return 'ng-select';
    if (tag === 'select') return 'select';
    if (el.getAttribute('role') === 'combobox') return 'combobox';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'input') return `input:${el.type || 'text'}`;
    return tag;
  }

  /** Identity by descriptor, never by position. */
  function describe(el) {
    const d = {
      label: findLabelFor(el),
      control: controlType(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      name: el.getAttribute('name') || null,
      fcn: el.getAttribute('formcontrolname') || null,
      required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
      readOnly: el.hasAttribute('readonly') || el.getAttribute('aria-readonly') === 'true',
      disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
      placeholder: el.getAttribute('placeholder') || null,
      maxlength: el.getAttribute('maxlength') || null,
      pattern: el.getAttribute('pattern') || null,
    };
    for (const k of Object.keys(d)) if (d[k] === null || d[k] === false) delete d[k];
    return d;
  }

  function shapeOf(v) {
    const s = String(v);
    const pattern = s
      .slice(0, 24)
      .replace(/[A-Z]/g, 'A')
      .replace(/[a-z]/g, 'a')
      .replace(/[0-9]/g, '#');
    return { len: s.length, pattern: pattern + (s.length > 24 ? '…' : '') };
  }

  /**
   * Redact a typed value. Selection controls are handled elsewhere and stay
   * verbatim; everything that was TYPED goes through here.
   */
  function redact(el, value) {
    const v = String(value ?? '');
    if (!v) return { empty: true };
    const norm = v.trim().toUpperCase();
    for (const entry of session.redact || []) {
      if (entry.norm === norm) return { token: `≡ ${entry.path}` };
    }
    const label = findLabelFor(el) || '';
    if (PII_LABEL.test(label) || PII_LABEL.test(el.name || '') || PII_LABEL.test(el.id || '')) {
      return { redacted: true, ...shapeOf(v) };
    }
    // Dates: keep the format, never the value.
    if (/^\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}$/.test(v.trim())) {
      return { dateFormat: v.trim().replace(/\d/g, '#') };
    }
    // Unmatched free text is still a value someone typed on a government form
    // — shape only. Vocabulary learning comes from option CLICKS, not typing.
    return shapeOf(v);
  }

  function verbatimAllowed(el) {
    // Native selects: the chosen option text is site vocabulary.
    return el.tagName === 'SELECT';
  }

  function currentValue(el) {
    if (el.tagName === 'SELECT') return el.selectedOptions?.[0]?.textContent?.trim() ?? el.value;
    if (el.type === 'checkbox' || el.type === 'radio') return String(el.checked);
    return el.value ?? el.textContent?.trim() ?? '';
  }

  // ---------------------------------------------------------------- emit

  function emit(kind, data) {
    queue.push({ ts: Date.now(), kind, frame: FRAME, top: IS_TOP, ...data });
    if (queue.length >= 50) flush();
    else if (!flushTimer) flushTimer = setTimeout(flush, 2000);
  }

  function flush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!queue.length || !session) return;
    const batch = queue;
    queue = [];
    try {
      chrome.runtime.sendMessage({ type: 'RECON_EVENTS', sessionId: session.id, events: batch }, () => {
        // Swallow "receiving end does not exist" — the batch is lost only if
        // the worker is truly gone, and the next flush retries the channel.
        void chrome.runtime.lastError;
      });
    } catch {
      // Extension context invalidated (update/reload) — stop quietly.
      stop();
    }
  }

  // ---------------------------------------------------------------- snapshot

  function snapshot(reason) {
    const fields = [];
    document.querySelectorAll(FIELD_SELECTOR).forEach((el) => {
      if (!isVisible(el)) return;
      const d = describe(el);
      if (el.tagName === 'SELECT') {
        d.options = [...el.options].map((o) => o.textContent.trim()).slice(0, 400);
      }
      if (el.type === 'radio' && el.name) d.radioValue = el.value;
      fields.push(d);
      knownVisible.set(el, true);
      lastValues.set(el, currentValue(el));
    });
    emit('snapshot', { reason, title: document.title, fieldCount: fields.length, fields });
  }

  // ---------------------------------------------------------------- listeners

  function onUserEvent(e) {
    if (!session) return;
    const el = e.target instanceof Element ? e.target.closest(FIELD_SELECTOR) : null;

    // Option clicks inside overlays are the vocabulary signal — verbatim.
    if (e.type === 'click' && e.target instanceof Element) {
      const opt = e.target.closest(OPTION_SELECTOR);
      if (opt && opt.closest(OVERLAY_SELECTOR)) {
        emit('option-selected', {
          value: opt.textContent.trim(),
          isTrusted: e.isTrusted,
          forField: lastInteraction?.field || null,
        });
        lastInteraction = { kind: 'option-selected', at: Date.now() };
        return;
      }
    }
    if (!el) return;

    userTouched.add(el);
    const field = describe(el);
    const record = { field, isTrusted: e.isTrusted };
    if (e.type === 'input' || e.type === 'change') {
      record.value = verbatimAllowed(el) ? { option: currentValue(el) } : redact(el, currentValue(el));
      lastValues.set(el, currentValue(el));
    }
    if (e.type === 'keydown') record.key = e.key;
    emit(e.type, record);
    lastInteraction = { kind: e.type, field: field.label || field.name || field.id, at: Date.now() };
  }

  function onKeydown(e) {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') onUserEvent(e);
  }

  // ---------------------------------------------------------------- mutations

  function onMutations(muts) {
    if (!session) return;
    for (const m of muts) {
      if (m.type === 'childList') {
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          // Dropdown overlay opened → capture the rendered options verbatim.
          const overlay = node.matches(OVERLAY_SELECTOR) ? node : node.querySelector?.(OVERLAY_SELECTOR);
          if (overlay) {
            const options = [...overlay.querySelectorAll(OPTION_SELECTOR)]
              .map((o) => o.textContent.trim())
              .filter(Boolean)
              .slice(0, 200);
            if (options.length) {
              emit('overlay-open', { options, count: options.length, forField: lastInteraction?.field || null });
            }
          }
          // Validation messages, quoted exactly.
          const errs = node.matches?.(VALIDATION_SELECTOR) ? [node] : [...(node.querySelectorAll?.(VALIDATION_SELECTOR) || [])];
          for (const err of errs) {
            const text = err.textContent.trim();
            if (text) emit('validation-message', { text, after: lastInteraction || null });
          }
          // New form fields → conditional appearance.
          const fields = node.matches?.(FIELD_SELECTOR) ? [node] : [...(node.querySelectorAll?.(FIELD_SELECTOR) || [])];
          for (const f of fields) {
            emit('field-appeared', { field: describe(f), after: lastInteraction || null });
            lastValues.set(f, currentValue(f));
          }
        }
        for (const node of m.removedNodes) {
          if (!(node instanceof Element)) continue;
          const fields = node.matches?.(FIELD_SELECTOR) ? [node] : [...(node.querySelectorAll?.(FIELD_SELECTOR) || [])];
          for (const f of fields) emit('field-removed', { field: describe(f), after: lastInteraction || null });
        }
      } else if (m.type === 'attributes' && m.target instanceof Element && m.target.matches(FIELD_SELECTOR)) {
        emit('attr-change', {
          field: describe(m.target),
          attr: m.attributeName,
          now: m.target.getAttribute(m.attributeName),
          after: lastInteraction || null,
        });
      }
    }
  }

  /**
   * Periodic sweep, off the hot path: visibility flips (conditional sections
   * toggled by CSS rather than DOM insertion) and silent value changes —
   * a control whose value moved with no user event since we last looked.
   */
  function sweep() {
    if (!session) return;
    document.querySelectorAll(FIELD_SELECTOR).forEach((el) => {
      const visible = isVisible(el);
      const was = knownVisible.get(el);
      if (was !== undefined && was !== visible) {
        emit(visible ? 'field-shown' : 'field-hidden', { field: describe(el), after: lastInteraction || null });
      }
      knownVisible.set(el, visible);

      if (!visible) return;
      const now = currentValue(el);
      const before = lastValues.get(el);
      if (before !== undefined && before !== now && userTouched.has(el) === false) {
        // Value changed but no user event ever hit this control → the page
        // itself set or reverted it. Redacted like any typed value.
        emit('silent-change', {
          field: describe(el),
          value: verbatimAllowed(el) ? { option: now } : redact(el, now),
        });
      }
      lastValues.set(el, now);
    });
  }

  // ---------------------------------------------------------------- lifecycle

  function start(s) {
    if (session) return;
    session = s;
    emit('frame-start', { title: document.title, readyState: document.readyState });
    document.addEventListener('focusin', onUserEvent, true);
    document.addEventListener('input', onUserEvent, true);
    document.addEventListener('change', onUserEvent, true);
    document.addEventListener('click', onUserEvent, true);
    document.addEventListener('keydown', onKeydown, true);
    window.addEventListener('pagehide', () => {
      emit('frame-unload', {});
      flush();
    });

    // The manifest injects at document_idle, but a resumed session can arm
    // while the document is still parsing (documentElement not there yet) —
    // snapshotting and observing then would either see nothing or throw.
    // Defer the DOM-dependent half until the DOM actually exists.
    const attachDomWork = () => {
      if (!session) return; // stopped before the DOM was ready
      snapshot('start');
      observer = new MutationObserver(onMutations);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'required', 'aria-invalid', 'aria-required', 'readonly'],
      });
      sweepTimer = setInterval(sweep, 750);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attachDomWork, { once: true });
    } else {
      attachDomWork();
    }
    console.log('[CrewForms recon] armed in', FRAME);
  }

  function stop() {
    if (!session) return;
    emit('frame-stop', {});
    flush();
    session = null;
    document.removeEventListener('focusin', onUserEvent, true);
    document.removeEventListener('input', onUserEvent, true);
    document.removeEventListener('change', onUserEvent, true);
    document.removeEventListener('click', onUserEvent, true);
    document.removeEventListener('keydown', onKeydown, true);
    observer?.disconnect();
    observer = null;
    if (sweepTimer) clearInterval(sweepTimer);
    sweepTimer = null;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'RECON_ARM') {
      start(message.session);
      sendResponse({ armed: true, frame: FRAME });
    } else if (message.type === 'RECON_DISARM') {
      stop();
      sendResponse({ armed: false });
    } else if (message.type === 'RECON_SNAPSHOT' && session) {
      snapshot('requested');
      flush();
      sendResponse({ ok: true });
    }
    return false;
  });

  // Postback survival: if a session is armed, a freshly loaded frame joins it
  // by itself — this is how the eNOAD iframe keeps recording across reloads.
  try {
    chrome.storage.local.get(['reconSession'], (data) => {
      if (chrome.runtime.lastError) return;
      if (data?.reconSession) {
        start(data.reconSession);
        emit('frame-reloaded', { title: document.title });
      }
    });
  } catch {
    // Extension context gone — nothing to do.
  }
})();
