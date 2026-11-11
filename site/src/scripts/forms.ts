// Estimador y contacto: validan en el navegador, envían a la Edge Function site-estimate y muestran el resultado sin recargar.
// Las tarifas nunca están aquí: el rango lo calcula el servidor con las vigentes (D-309).

type Errors = Record<string, string>;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ZIP = /^\d{5}(-\d{4})?$/;

// Textos de error (D-200).
const MSG = {
  required: 'Please fill in this field.',
  email: 'Please enter a valid email address.',
  phone: 'Please enter a 10-digit US phone number.',
  zip: 'Please enter a 5-digit ZIP code.',
  sqft: 'Enter a size between 200 and 1,000,000 sq ft.',
  message: 'Please tell us a little about what you need (at least 10 characters).',
  network: "We couldn't send your request. Please try again, or call (786) 250-1324.",
  rate: 'Too many requests in a short time. Please try again later, or call (786) 250-1324.',
  server: 'Something went wrong on our side. Please call (786) 250-1324 or email info@cidclean.com.',
};

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const digits = (s: string) => s.replace(/\D/g, '');

function val(form: HTMLFormElement, name: string): string {
  const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  return el ? el.value.trim() : '';
}

function check(form: HTMLFormElement, names: string[]): Errors {
  const e: Errors = {};
  for (const n of names) {
    const v = val(form, n);
    const el = form.elements.namedItem(n) as HTMLInputElement | null;
    if (!el) continue;
    if (el.required && !v) { e[n] = MSG.required; continue; }
    if (!v) continue;
    if (n === 'email' && !EMAIL.test(v)) e[n] = MSG.email;
    if (n === 'phone') { const d = digits(v); if (!(d.length === 10 || (d.length === 11 && d[0] === '1'))) e[n] = MSG.phone; }
    if (n === 'zip' && !ZIP.test(v)) e[n] = MSG.zip;
    if (n === 'sqft') { const s = Number(digits(v)); if (!(s >= 200 && s <= 1_000_000)) e[n] = MSG.sqft; }
    if (n === 'message' && v.length < 10) e[n] = MSG.message;
  }
  return e;
}

function show(form: HTMLFormElement, names: string[], errors: Errors) {
  let first: HTMLElement | null = null;
  for (const n of names) {
    const el = form.elements.namedItem(n) as HTMLElement | null;
    const box = form.querySelector<HTMLElement>(`[data-err="${n}"]`);
    if (!el) continue;
    if (errors[n]) {
      el.setAttribute('aria-invalid', 'true');
      if (box) { box.textContent = errors[n]; box.hidden = false; }
      first ??= el;
    } else {
      el.removeAttribute('aria-invalid');
      if (box) { box.textContent = ''; box.hidden = true; }
    }
  }
  first?.focus();
  return !first;
}

function fieldsIn(scope: Element): string[] {
  return Array.from(scope.querySelectorAll<HTMLInputElement>('input[name], select[name], textarea[name]'))
    .filter((el) => el.name !== 'website')
    .map((el) => el.name);
}

// Token del formulario (orden 100): lo firma site-estimate con la hora de emisión y solo vale entre 3 s y 2 h después.
// Se pide al cargar la página; si falta o va a vencer, se pide otra vez al enviar y se espera a que cumpla los 3 s.
const MIN_WAIT_MS = 3200;
const REFRESH_MS = 100 * 60 * 1000;
const tokens = new Map<string, Promise<{ token: string; at: number } | null>>();

function pedirToken(endpoint: string) {
  const p = fetch(endpoint, { method: 'GET' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d && typeof d.token === 'string' ? { token: d.token as string, at: Date.now() } : null))
    .catch(() => null);
  tokens.set(endpoint, p);
  return p;
}

async function tokenListo(endpoint: string): Promise<string> {
  let t = await (tokens.get(endpoint) ?? pedirToken(endpoint));
  if (!t || Date.now() - t.at > REFRESH_MS) t = await pedirToken(endpoint);
  if (!t) throw new TypeError('token'); // se muestra como error de red
  const falta = MIN_WAIT_MS - (Date.now() - t.at);
  if (falta > 0) await new Promise((ok) => setTimeout(ok, falta));
  return t.token;
}

export function initForms() {
  document.querySelectorAll<HTMLFormElement>('form[data-site-form]').forEach((form) => {
    const kind = form.dataset.siteForm as 'estimate' | 'contact';
    const endpoint = form.dataset.endpoint ?? '';
    const step1 = form.querySelector<HTMLElement>('[data-step="1"]');
    const step2 = form.querySelector<HTMLElement>('[data-step="2"]');
    const result = form.querySelector<HTMLElement>('[data-result]');
    const formError = form.querySelector<HTMLElement>('[data-form-error]');
    if (endpoint && !tokens.has(endpoint)) void pedirToken(endpoint);
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const pills = form.querySelectorAll<HTMLElement>('.stepper span');
    form.querySelectorAll<HTMLElement>('[data-needs-js]').forEach((el) => { el.hidden = false; });
    if (submit) submit.disabled = false;

    const goto = (n: 1 | 2) => {
      if (!step1 || !step2) return;
      step1.hidden = n !== 1;
      step2.hidden = n !== 2;
      pills.forEach((p, i) => p.classList.toggle('on', i === n - 1));
      const target = (n === 1 ? step1 : step2).querySelector<HTMLElement>('input, select');
      target?.focus();
    };

    form.querySelector('[data-next]')?.addEventListener('click', () => {
      if (step1 && show(form, fieldsIn(step1), check(form, fieldsIn(step1)))) goto(2);
    });
    form.querySelector('[data-back]')?.addEventListener('click', () => goto(1));

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (formError) formError.hidden = true;
      const names = fieldsIn(form);
      if (step1 && step2 && !step1.hidden) {
        if (show(form, fieldsIn(step1), check(form, fieldsIn(step1)))) goto(2);
        return;
      }
      if (!show(form, names, check(form, names))) return;
      const payload: Record<string, unknown> = {
        kind,
        name: val(form, 'name'),
        company: val(form, 'company'),
        email: val(form, 'email'),
        phone: val(form, 'phone'),
        city: val(form, 'city'),
        zip: val(form, 'zip'),
        website: val(form, 'website'),
      };
      if (kind === 'estimate') {
        payload.type = val(form, 'type');
        payload.sqft = Number(digits(val(form, 'sqft')));
        payload.frequency = val(form, 'frequency');
      } else {
        payload.message = val(form, 'message');
      }
      if (submit) { submit.disabled = true; submit.dataset.label ??= submit.textContent ?? ''; submit.textContent = 'Sending…'; }
      try {
        payload.token = await tokenListo(endpoint);
        const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 400 && data.fields) { show(form, names, data.fields as Errors); throw new Error('handled'); }
          throw new Error(res.status === 429 ? MSG.rate : MSG.server);
        }
        renderResult(form, kind, data, result);
      } catch (err) {
        const m = err instanceof TypeError ? MSG.network : (err as Error).message;
        if (m !== 'handled' && formError) { formError.textContent = m; formError.hidden = false; }
      } finally {
        if (submit) { submit.disabled = false; submit.textContent = submit.dataset.label ?? 'Send'; }
      }
    });
  });
}

function renderResult(form: HTMLFormElement, kind: string, data: Record<string, any>, box: HTMLElement | null) {
  if (!box) return;
  form.querySelectorAll<HTMLElement>('[data-step], .stepper, [data-hide-on-done]').forEach((el) => { el.hidden = true; });
  if (kind === 'estimate') {
    const range = box.querySelector('[data-range]');
    const per = box.querySelector('[data-per-visit]');
    const walk = box.querySelector<HTMLElement>('[data-walkthrough]');
    if (range) range.textContent = `${money(data.range_low)} – ${money(data.range_high)}`;
    if (per) per.textContent = `per month · about ${money(data.per_visit)} per visit`;
    if (walk) walk.hidden = !data.walkthrough_recommended;
  }
  box.hidden = false;
  box.setAttribute('tabindex', '-1');
  box.focus();
}
