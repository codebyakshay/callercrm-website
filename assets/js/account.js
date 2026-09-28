// /account: log in, sign up, reset password and the company dashboard, on one page.
// Company admins sign in with Google, or with the same email/username + password as the app.
// The server checks everything again (Google's token, our login token, prices); this file only
// decides what to show.
const API = "https://api.callercrm.codebyakshay.com/api/signup";
const BILLING_API = "https://api.callercrm.codebyakshay.com/api/billing";
const GOOGLE_CLIENT_ID = "135149357843-kh5reev4cvesdos3p1uvsq2b044edrdd.apps.googleusercontent.com";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.codebyakshay.callercrm";
const WHATSAPP = "917898131225";
// Same as the pricing section and the server (src/lib/pricing.ts). The server sets the real amount.
const PRICES = { STARTER: { name: "Starter", base: 249, seats: 10, pack: 69 }, PRO: { name: "Pro", base: 499, seats: 12, pack: 85 } };
const PLAN_LABEL = { TRIAL: "Free trial · every Pro feature", STARTER: "Starter plan", PRO: "Pro plan" };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const params = new URLSearchParams(location.search);
const wantedPlan = { starter: "STARTER", pro: "PRO" }[params.get("plan")] || null;

// ── Small helpers ───────────────────────────────────────────────────────
const rupees = (n) => `₹${n.toLocaleString("en-IN")}`;
const dayKey = (d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const addDaysKey = (key, n) => dayKey(new Date(Date.parse(`${key}T12:00:00+05:30`) + n * 864e5));
const niceDay = (key) =>
  new Date(`${key}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

async function post(url, body) {
  let res;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, status: 0, data: { error: "Couldn't reach CallerCRM. Check your internet and try again." } };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function busy(btn, on, label) {
  if (!btn.dataset.label) btn.dataset.label = btn.innerHTML;
  btn.disabled = on;
  if (on) btn.textContent = label;
  else btn.innerHTML = btn.dataset.label;
}

// ── Remembered login (this tab only) ────────────────────────────────────
// Google's token lasts ~1 hour, our password-login token 12 hours; both are JWTs with an expiry.
const KEYS = { google: "callercrm.google", web: "callercrm.web" };
function remember(kind, token) {
  try { sessionStorage.setItem(KEYS[kind], token); } catch { /* private mode: this page only */ }
}
function remembered(kind) {
  try {
    const token = sessionStorage.getItem(KEYS[kind]);
    if (!token) return null;
    const { exp } = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (exp * 1000 > Date.now() + 60000) return token;
    sessionStorage.removeItem(KEYS[kind]);
  } catch { /* unreadable: log in again */ }
  return null;
}
function forgetAll() {
  try { Object.values(KEYS).forEach((k) => sessionStorage.removeItem(k)); } catch { /* nothing stored */ }
}

// ── Steps ───────────────────────────────────────────────────────────────
let step = "login";
let google = null; // Google ID token from this visit's sign-in

const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

function show(next, message = "") {
  step = next;
  const swap = () => {
    $("#gate").hidden = false;
    $("#dash").hidden = true;
    $$(".step").forEach((el) => (el.hidden = el.dataset.step !== next));
    $$("[data-error]", $(`[data-step="${next}"]`)).forEach((e) => (e.textContent = message));
    window.scrollTo({ top: 0 });
  };
  // Moving between steps crossfades (see ::view-transition in account.css); the first screen just appears.
  const switching = !$("#gate").hidden && $$(".step").some((el) => !el.hidden);
  if (switching && document.startViewTransition && !calm) document.startViewTransition(swap);
  else swap();
}

function stepError(message) {
  $$("[data-error]", $(`[data-step="${step}"]`)).forEach((e) => (e.textContent = message));
}

// ── Google ──────────────────────────────────────────────────────────────
function onGoogleReady(fn) {
  if (window.google?.accounts?.id) fn();
  else window.addEventListener("google-loaded", fn, { once: true });
}
window.onGoogleLibraryLoad = () => window.dispatchEvent(new Event("google-loaded"));

let googleStarted = false;
function startGoogle() {
  if (googleStarted) return;
  googleStarted = true;
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (r) => onGoogle(r.credential),
    ux_mode: "popup",
    auto_select: true,
    cancel_on_tap_outside: true,
  });
}

// Every step's Google button is drawn once, up front, so switching steps never
// rebuilds it (a fresh button flashes "Sign in with Google" before your name loads).
function renderGoogleButtons() {
  onGoogleReady(() => {
    startGoogle();
    $$("[data-google]").forEach((slot) => {
      window.google.accounts.id.renderButton(slot, {
        theme: "outline", size: "large", shape: "pill", logo_alignment: "center", width: Math.min(340, window.innerWidth - 72),
        text: slot.closest("[data-step]").dataset.step === "signup" ? "signup_with" : "continue_with",
      });
      revealWhenPersonal(slot);
    });
  });
}

// Google draws a plain button, then swaps in "Continue as <name>" once its frame loads
// (the frame grows from 0px). Keep the slot blank until then so the button appears once;
// people not signed in to Google never get the frame, so show the plain one after 1.5 s.
function revealWhenPersonal(slot) {
  const reveal = () => slot.classList.add("ready");
  setTimeout(reveal, 1500);
  const frame = slot.querySelector("iframe");
  if (frame) new ResizeObserver(() => frame.offsetHeight && reveal()).observe(frame);
}

async function onGoogle(token) {
  google = token;
  remember("google", token);
  stepError("");
  if (step === "reset") return googleForReset(token);
  if (step === "signup") {
    const { ok, data } = await post(`${API}/check`, { credential: token });
    if (!ok) return stepError(data.error || "Google sign-in didn't work. Please try again.");
    if (data.exists) return loadAccount({ credential: token });
    $$("[data-who]").forEach((b) => (b.textContent = data.email));
    const form = $("#signup-form");
    if (!form.name.value) form.name.value = data.name || "";
    return show("details");
  }
  // Log in with a Google account that has no company yet: that's a sign-up.
  loadAccount({ credential: token }, { noCompany: () => onGoogleSignup(token) });
}

async function onGoogleSignup(token) {
  step = "signup";
  await onGoogle(token);
}

// ── Log in with password ────────────────────────────────────────────────
function initPasswordLogin() {
  const form = $("#pw-login");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    stepError("");
    if (!form.reportValidity()) return;
    const btn = $("button[type=submit]", form);
    busy(btn, true, "Logging in…");
    const { ok, data } = await post(`${API}/login`, { username: form.username.value, password: form.password.value });
    busy(btn, false);
    if (!ok) return stepError(data.error || "Couldn't log you in. Please try again.");
    remember("web", data.token);
    form.reset();
    loadAccount({ token: data.token });
  });
}

// ── Sign up: company details ────────────────────────────────────────────
function initSignup() {
  const form = $("#signup-form");
  const phone = form.phone;
  phone.addEventListener("input", () => { phone.setCustomValidity(""); $("#phone-error").textContent = ""; });
  phone.addEventListener("change", async () => {
    if (!google || phone.value.replace(/\D/g, "").length < 10) return;
    const { ok, data } = await post(`${API}/check`, { credential: google, phone: phone.value });
    if (ok && data.phoneTaken) {
      const msg = "This number already has a CallerCRM company (one per number). Use another number, or log in.";
      phone.setCustomValidity(msg);
      $("#phone-error").textContent = msg;
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    stepError("");
    if (!form.reportValidity()) return;
    const btn = $("#signup-submit");
    const f = new FormData(form);
    const body = {
      credential: google,
      companyName: f.get("companyName"), name: f.get("name"), phone: f.get("phone"),
      address: f.get("address"), city: f.get("city") || String(f.get("address")).slice(0, 100),
      teamSize: f.get("teamSize"), gstNumber: f.get("gstNumber"), username: f.get("username"), password: f.get("password"),
    };
    // Free trial: the company is created now (we approve it). Starter/Pro: nothing is created until
    // they've paid; the server keeps the form while they're on Cashfree's page.
    if (!wantedPlan) {
      busy(btn, true, "Creating your company…");
      const { ok, status, data } = await post(API, body);
      busy(btn, false);
      if (!ok) return status === 401 ? show("signup", data.error) : stepError(data.error || "Something went wrong. Please try again.");
      form.reset();
      return loadAccount({ credential: google }, { justSignedUp: true });
    }
    busy(btn, true, "Opening secure payment…");
    const { ok, status, data } = await post(`${API}/checkout`, { ...body, plan: co.plan, interval: co.interval, extraPacks: co.packs });
    if (!ok) {
      busy(btn, false);
      if (status === 401) return show("signup", data.error);
      if (data.code === "PAYMENTS_OFF") return paymentsOff(body);
      return stepError(data.error || "Couldn't start the payment. Please try again.");
    }
    if (!window.Cashfree) {
      busy(btn, false);
      return stepError("The payment page didn't load. Check your internet, reload, and try again.");
    }
    const result = await window.Cashfree({ mode: data.mode }).subscriptionsCheckout({ subsSessionId: data.sessionId, redirectTarget: "_self" });
    if (result?.error) {
      busy(btn, false);
      stepError(result.error.message || "The payment page didn't open. Please try again.");
    }
  });
}

/** Online payment not switched on (yet): hand over to WhatsApp with what they typed. Nothing is saved. */
function paymentsOff(body) {
  const p = PRICES[co.plan];
  const msg = `Hi, I'd like to buy CallerCRM ${p.name} (${co.interval === "YEAR" ? "yearly" : "monthly"}, ${p.seats + co.packs * 5} callers).\n` +
    `Company: ${body.companyName}\nName: ${body.name}\nMobile: ${body.phone}\nAddress: ${body.address}\nEmail: ${$("[data-who]").textContent}`;
  const el = $('[data-step="details"] [data-error]');
  el.replaceChildren("Online payment isn't switched on yet. ");
  const a = Object.assign(document.createElement("a"), { href: `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, target: "_blank", rel: "noopener", textContent: "Message us on WhatsApp" });
  el.append(a, " and we'll set you up today.");
}

// ── Sign up: plan, billing period and callers (Starter/Pro) ─────────────
const co = { plan: wantedPlan || "PRO", interval: "MONTH", packs: 0 };

function drawCheckout() {
  const p = PRICES[co.plan];
  const year = co.interval === "YEAR";
  const per = year ? "/year" : "/month";
  const total = (p.base + co.packs * p.pack) * (year ? 10 : 1);
  $$("[data-cplan]").forEach((b) => { b.classList.toggle("is-on", b.dataset.cplan === co.plan); b.setAttribute("aria-pressed", String(b.dataset.cplan === co.plan)); });
  $$("[data-cint]").forEach((b) => { b.classList.toggle("is-on", b.dataset.cint === co.interval); b.setAttribute("aria-pressed", String(b.dataset.cint === co.interval)); });
  $("#c-pack-price").textContent = `Packs of 5, ${rupees(p.pack * (year ? 10 : 1))}${per} each`;
  $("#c-extra").textContent = `+${co.packs * 5}`;
  $("#c-minus").disabled = co.packs === 0;
  $("#c-plus").disabled = co.packs === 20;
  $("#c-callers").textContent = `${p.seats + co.packs * 5} callers`;
  $("#c-total").textContent = rupees(total) + per;
  $("#c-note").textContent = `${rupees(total)} is charged today and your plan starts now, then every ${year ? "year" : "month"} by UPI Autopay or card. Cancel any time. Secure payment by Cashfree.`;
  const submit = $("#signup-submit");
  submit.innerHTML = `<svg aria-hidden="true"><use href="/assets/img/icons.svg#card"/></svg>Verify and pay ${rupees(total)}`;
  submit.dataset.label = submit.innerHTML;
}

function initCheckout() {
  if (!wantedPlan) return;
  $("#checkout").hidden = false;
  $("#plan-choice").hidden = true;
  $$("[data-cplan]").forEach((b) => b.addEventListener("click", () => { co.plan = b.dataset.cplan; drawCheckout(); }));
  $$("[data-cint]").forEach((b) => b.addEventListener("click", () => { co.interval = b.dataset.cint; drawCheckout(); }));
  $("#c-minus").addEventListener("click", () => { co.packs = Math.max(0, co.packs - 1); drawCheckout(); });
  $("#c-plus").addEventListener("click", () => { co.packs = Math.min(20, co.packs + 1); drawCheckout(); });
  drawCheckout();
}

// ── Google suggestions: company name and business address ───────────────
// A browser key restricted to this website, with Maps JavaScript API and Places API (New) on.
// Empty = the two fields stay plain text boxes.
const MAPS_KEY = "";
let placesLib = null;

function loadPlaces() {
  if (!MAPS_KEY) return Promise.resolve(null);
  placesLib ??= new Promise((resolve) => {
    window.__placesReady = () => window.google.maps.importLibrary("places").then(resolve, () => resolve(null));
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&loading=async&callback=__placesReady&region=IN&language=en`;
    s.async = true;
    s.onerror = () => resolve(null);
    document.head.append(s);
  });
  return placesLib;
}

/** "Indore, Madhya Pradesh" from a picked place. */
function cityOf(place) {
  const part = (type) => place.addressComponents?.find((c) => c.types.includes(type))?.longText;
  return [part("locality") || part("administrative_area_level_3") || part("administrative_area_level_2"), part("administrative_area_level_1")]
    .filter(Boolean).join(", ");
}

/** Our own dropdown under an input, fed by Google Places (India only). */
function suggest(input, { types, onPick }) {
  const list = $(".suggest-list", input.parentElement);
  let token = null;
  let timer = 0;
  let items = [];
  let active = -1;
  const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); active = -1; };
  const mark = () => $$("li", list).forEach((li, i) => li.classList.toggle("is-active", i === active));
  async function pick(i) {
    const prediction = items[i];
    close();
    if (!prediction) return;
    const place = prediction.toPlace();
    await place.fetchFields({ fields: ["displayName", "formattedAddress", "addressComponents"] }).catch(() => {});
    token = null; // a pick ends Google's billing session
    onPick(place, prediction);
  }
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      const places = q.length >= 3 ? await loadPlaces() : null;
      if (!places) return close();
      token ??= new places.AutocompleteSessionToken();
      try {
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q, sessionToken: token, includedRegionCodes: ["in"], ...(types ? { includedPrimaryTypes: types } : {}),
        });
        items = suggestions.map((x) => x.placePrediction).filter(Boolean).slice(0, 5);
      } catch {
        items = [];
      }
      if (!items.length || input.value.trim() !== q) return close();
      list.replaceChildren(...items.map((p, i) => {
        const li = document.createElement("li");
        li.role = "option";
        const main = document.createElement("b");
        main.textContent = p.mainText?.text ?? p.text.text;
        const sub = document.createElement("span");
        sub.textContent = p.secondaryText?.text ?? "";
        li.append(main, sub);
        li.addEventListener("mousedown", (e) => { e.preventDefault(); void pick(i); });
        return li;
      }));
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }, 250);
  });
  input.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      mark();
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      void pick(active);
    } else if (e.key === "Escape") close();
  });
  input.addEventListener("blur", () => setTimeout(close, 120));
}

function initPlaces() {
  if (!MAPS_KEY) return;
  const form = $("#signup-form");
  $("[data-places-hint]").hidden = false;
  const setAddress = (place) => {
    if (place.formattedAddress) form.address.value = place.formattedAddress;
    form.city.value = cityOf(place);
  };
  suggest(form.companyName, {
    types: ["establishment"],
    onPick: (place) => {
      if (place.displayName) form.companyName.value = place.displayName;
      setAddress(place);
    },
  });
  suggest(form.address, { onPick: setAddress });
  form.address.addEventListener("input", () => (form.city.value = "")); // typed by hand: city = what they typed
}

// ── Forgot password ─────────────────────────────────────────────────────
async function googleForReset(token) {
  const { ok, data } = await post(`${API}/check`, { credential: token });
  if (!ok) return stepError(data.error || "Google sign-in didn't work. Please try again.");
  if (!data.exists) return stepError(`${data.email} doesn't have a CallerCRM company. Try another Google account, or sign up.`);
  $$("[data-who]").forEach((b) => (b.textContent = data.email));
  $("#reset-form").hidden = false;
  $("[data-google]", $('[data-step="reset"]')).hidden = true;
}

function initReset() {
  const form = $("#reset-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    stepError("");
    if (!form.reportValidity()) return;
    const btn = $("button[type=submit]", form);
    busy(btn, true, "Saving…");
    const { ok, status, data } = await post(`${API}/reset-password`, { credential: google, password: form.password.value });
    busy(btn, false);
    if (!ok) return status === 401 ? show("reset", data.error) : stepError(data.error || "Something went wrong.");
    form.reset();
    form.hidden = true;
    $("[data-ok]", $('[data-step="reset"]')).textContent =
      `Password saved. Log in to the app with ${data.email || data.username} and your new password.`;
  });
}

// ── Dashboard ───────────────────────────────────────────────────────────
let auth = null; // { credential } or { token }: sent with every dashboard call
let account = null;
const bill = { plan: wantedPlan || "PRO", interval: "MONTH", packs: 0, discount: 0 };

async function loadAccount(authBody, { justSignedUp = false, noCompany } = {}) {
  const { ok, status, data } = await post(`${API}/account`, authBody);
  if (status === 404) {
    if (noCompany) return noCompany();
    return show("signup", "This Google account doesn't have a company yet. Create one below.");
  }
  if (!ok) {
    forgetAll();
    return show("login", status === 401 && authBody.token ? "Your login has expired. Please log in again." : data.error || "");
  }
  auth = authBody;
  account = data;
  renderDashboard(justSignedUp);
}

function renderDashboard(justSignedUp) {
  const d = account;
  $("#gate").hidden = true;
  $("#dash").hidden = false;
  window.scrollTo({ top: 0 });

  const paid = d.payments.length > 0;
  $("#d-plan").textContent = d.awaitingPayment ? `${PRICES[d.plan]?.name ?? d.plan} · awaiting payment` : d.pendingApproval ? "Waiting for approval" : PLAN_LABEL[d.plan] || d.plan;
  $("#d-company").textContent = d.company;
  $("#d-who").textContent = d.email || d.username;

  const st = $("#d-status");
  st.className = "status";
  if (d.suspended) {
    st.classList.add("bad");
    st.textContent = "This account is suspended. Message us on WhatsApp.";
  } else if (d.awaitingPayment) {
    st.classList.add("warn");
    st.textContent = "Not active yet. Pay below to start; we check new companies within a few hours, then the app unlocks.";
  } else if (d.pendingApproval) {
    st.classList.add("warn");
    st.textContent = paid
      ? "Paid. We're checking your company, usually within a few hours, then you can log in to the app."
      : "Waiting for approval. We check every new company by hand, usually within a few hours.";
  } else if (d.notice) {
    st.classList.add(d.notice.tone === "bad" ? "bad" : "warn");
    st.textContent = `${d.notice.title}. ${d.notice.text}`;
  } else if (d.paidUntil) {
    st.textContent = d.plan === "TRIAL" ? `Free trial until ${niceDay(d.paidUntil)}` : `Paid until ${niceDay(d.paidUntil)}`;
  } else {
    st.textContent = "Active";
  }
  $("#d-callers").textContent = d.seatLimit ? `${d.callers} of ${d.seatLimit}` : `${d.callers}`;
  requestAnimationFrame(() => ($("#d-meter").style.width = d.seatLimit ? `${Math.min(100, (d.callers / d.seatLimit) * 100)}%` : "8%"));
  $("#d-login").textContent = d.email ? `${d.email} or ${d.username}` : d.username;
  $("#d-since").textContent = d.profile?.since ? niceDay(d.profile.since) : "—";

  const p = d.profile || {};
  const row = (id, value) => { $(`#${id}`).textContent = value ?? ""; $(`#${id}-row`).hidden = !value; };
  row("p-phone", p.phone ? `+91 ${p.phone}` : null);
  row("p-city", p.city);
  row("p-team", p.teamSize ? `${p.teamSize} callers` : null);
  row("p-gst", p.gstNumber);

  renderBilling();
  renderPayments();

  const banner = $("#d-banner");
  banner.className = "banner";
  banner.hidden = true;
  if (params.has("subscription")) {
    banner.hidden = false;
    banner.textContent = d.subscription
      ? "Payment set up. You're all set."
      : "Thanks! If you approved the payment, it can take a minute to show here. Reload in a minute.";
  } else if (d.awaitingPayment) {
    banner.hidden = false;
    banner.textContent = `${justSignedUp ? "Your company is created. " : ""}Pay below to start ${PRICES[d.plan]?.name ?? "your plan"}. Then we check your company, usually within a few hours, and you can log in to the app.`;
  } else if (d.pendingApproval) {
    banner.hidden = false;
    banner.textContent = paid
      ? "Payment received. We're checking your company, usually within a few hours, then you can log in to the app."
      : `${justSignedUp ? "Your company is created. " : ""}We check every new company by hand, usually within a few hours. Once it's approved, your 14-day free trial starts and you can log in to the app.`;
  } else if (justSignedUp) {
    banner.hidden = false;
    banner.innerHTML = `Your 14-day free trial has started. <a href="${PLAY_URL}" target="_blank" rel="noopener">Install the app</a>, log in, and add your callers.`;
  }
  if (d.awaitingPayment || (wantedPlan && !$("#b-pick").hidden)) {
    setTimeout(() => $("#billing").scrollIntoView({ behavior: "smooth", block: "start" }), 250);
  }
}

// ── Billing ─────────────────────────────────────────────────────────────
function priceOf(plan, interval, packs) {
  const monthly = PRICES[plan].base + packs * PRICES[plan].pack;
  const full = interval === "YEAR" ? monthly * 10 : monthly;
  return Math.round((full * (100 - bill.discount)) / 100); // same rounding as the server
}

/** Mirrors the server: can the first charge wait for the trial / current period to end? */
function deferral() {
  const today = dayKey(new Date());
  const paidUntil = account.paidUntil;
  if (paidUntil && paidUntil <= today) return null;
  const earliest = addDaysKey(today, 2);
  const after = paidUntil ? addDaysKey(paidUntil, 1) : earliest;
  return after > earliest ? after : earliest;
}

function renderBilling() {
  const d = account;
  bill.discount = d.discountPct || 0;
  const sub = d.subscription;
  $("#b-active").hidden = !sub;
  $("#b-pick").hidden = Boolean(sub) || d.suspended;
  if (sub) {
    const extra = sub.extraPacks ? ` + ${sub.extraPacks * 5} callers` : "";
    $("#b-active-plan").textContent = `${PRICES[sub.plan]?.name ?? sub.plan}${extra}`;
    $("#b-active-price").textContent = rupees(sub.amount) + (sub.interval === "YEAR" ? "/year" : "/month");
    const next = d.payments.length ? addDaysKey(d.paidUntil, 1) : sub.firstChargeDay;
    $("#b-next").textContent = niceDay(next);
    return;
  }
  if (d.awaitingPayment && !wantedPlan) bill.plan = d.plan;
  $("#b-title").textContent = d.plan === "TRIAL" ? "Choose your plan" : "Pay for your plan";
  $(`input[name="b-plan"][value="${bill.plan}"]`).checked = true;
  $("#b-contact").hidden = !d.paymentsOpen || !(d.needEmail || d.needPhone);
  $("#b-email-field").hidden = !d.needEmail;
  $("#b-phone-field").hidden = !d.needPhone;
  drawPicker();
}

function drawPicker() {
  const d = account;
  const per = bill.interval === "YEAR" ? "/year" : "/month";
  const every = bill.interval === "YEAR" ? "year" : "month";
  $$("[data-price]").forEach((el) => (el.textContent = rupees(priceOf(el.dataset.price, bill.interval, 0)) + per));
  $$("[data-interval]").forEach((b) => {
    const on = b.dataset.interval === bill.interval;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  const p = PRICES[bill.plan];
  const packPrice = Math.round(((bill.interval === "YEAR" ? p.pack * 10 : p.pack) * (100 - bill.discount)) / 100);
  $("#b-pack-price").textContent = `Packs of 5, ${rupees(packPrice)}${per} each`;
  $("#b-extra").textContent = `+${bill.packs * 5}`;
  $("#b-minus").disabled = bill.packs === 0;
  $("#b-plus").disabled = bill.packs === 20;
  $("#b-callers").textContent = `${p.seats + bill.packs * 5} callers`;
  const total = priceOf(bill.plan, bill.interval, bill.packs);
  $("#b-total").textContent = rupees(total) + per;
  $("#b-discount").hidden = !bill.discount;
  $("#b-discount").textContent = `Founding customer price: ${bill.discount}% off, for as long as you stay.`;

  // Which ways to pay: now (plan starts today), and/or when the trial / paid period ends.
  // Picked a plan at sign-up, or not approved yet: no running trial to wait for, so pay now only.
  const later = d.awaitingPayment || d.pendingApproval ? null : deferral();
  const trial = d.plan === "TRIAL";
  const nowBtn = $("#b-now");
  const laterBtn = $("#b-later");
  nowBtn.hidden = !d.paymentsOpen || (!trial && Boolean(later));
  laterBtn.hidden = !d.paymentsOpen || !later;
  $("#b-wa").hidden = d.paymentsOpen;
  nowBtn.textContent = trial ? `Start ${p.name} now · pay ${rupees(total)}` : d.awaitingPayment ? `Pay ${rupees(total)} and start ${p.name}` : `Pay ${rupees(total)} and continue`;
  nowBtn.dataset.label = nowBtn.textContent;
  laterBtn.textContent = trial ? `Pay when my trial ends (${niceDay(later || dayKey(new Date()))})` : `Renew automatically from ${niceDay(later || dayKey(new Date()))}`;
  laterBtn.dataset.label = laterBtn.textContent;
  laterBtn.classList.toggle("btn-primary", nowBtn.hidden);
  laterBtn.classList.toggle("btn-ghost", !nowBtn.hidden);

  const notes = [];
  if (!nowBtn.hidden) notes.push(`${rupees(total)} is charged today and your plan starts now. Then every ${every} on the same date.`);
  if (!laterBtn.hidden) notes.push(`${trial ? "Pay when your trial ends" : "Automatic renewal"}: nothing today (₹1 is checked and refunded), first charge on ${niceDay(later)}.`);
  if (d.paymentsOpen) notes.push("Secure payment by Cashfree: UPI Autopay or card. Cancel any time here.");
  $("#b-note").textContent = notes.join(" ");

  if (!d.paymentsOpen) {
    const msg = `Hi, I'd like to pay for CallerCRM.\nCompany: ${d.company}\nLogin: ${d.email || d.username}\nPlan: ${p.name} ${every}ly, ${p.seats + bill.packs * 5} callers (${rupees(total)}${per})`;
    $("#b-wa").href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;
  }
}

async function subscribe(startNow, btn) {
  $("#b-error").textContent = "";
  busy(btn, true, "Opening secure payment…");
  const { ok, status, data } = await post(`${BILLING_API}/subscribe`, {
    ...auth, plan: bill.plan, interval: bill.interval, extraPacks: bill.packs, startNow,
    email: $("#b-email").value, phone: $("#b-phone").value,
  });
  if (!ok) {
    busy(btn, false);
    if (status === 401) { forgetAll(); return show("login", data.error); }
    $("#b-error").textContent = data.error || "Couldn't start the payment. Please try again.";
    return;
  }
  if (!window.Cashfree) {
    busy(btn, false);
    $("#b-error").textContent = "The payment page didn't load. Check your internet, reload, and try again.";
    return;
  }
  const result = await window.Cashfree({ mode: data.mode }).subscriptionsCheckout({ subsSessionId: data.sessionId, redirectTarget: "_self" });
  if (result?.error) {
    busy(btn, false);
    $("#b-error").textContent = result.error.message || "The payment page didn't open. Please try again.";
  }
}

function initBilling() {
  $$("[data-interval]").forEach((b) => b.addEventListener("click", () => { bill.interval = b.dataset.interval; drawPicker(); }));
  $$('input[name="b-plan"]').forEach((r) => r.addEventListener("change", () => { bill.plan = r.value; drawPicker(); }));
  $("#b-minus").addEventListener("click", () => { bill.packs = Math.max(0, bill.packs - 1); drawPicker(); });
  $("#b-plus").addEventListener("click", () => { bill.packs = Math.min(20, bill.packs + 1); drawPicker(); });
  $("#b-now").addEventListener("click", (e) => subscribe(true, e.currentTarget));
  $("#b-later").addEventListener("click", (e) => subscribe(false, e.currentTarget));

  $("#b-cancel").addEventListener("click", async () => {
    if (!confirm("Stop automatic payments? Your plan keeps working until its end date, then the account turns read-only unless you pay again.")) return;
    $("#b-cancel-error").textContent = "";
    const { ok, status, data } = await post(`${BILLING_API}/cancel`, { ...auth });
    if (!ok) {
      if (status === 401) { forgetAll(); return show("login", data.error); }
      $("#b-cancel-error").textContent = data.error || "Couldn't cancel. Please try again.";
      return;
    }
    loadAccount(auth);
  });
}

function renderPayments() {
  const list = account.payments || [];
  $("#pay-empty").hidden = list.length > 0;
  $("#pay-list").replaceChildren(
    ...list.map((p) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${niceDay(p.paidOn)}</span><span><b>${rupees(p.amount)}</b> · to ${niceDay(p.coversUntil)}</span>`;
      return li;
    }),
  );
}

function initDashboard() {
  initBilling();
  $("#logout").addEventListener("click", () => {
    auth = null;
    account = null;
    forgetAll();
    window.google?.accounts?.id?.disableAutoSelect();
    show("login");
  });
  const form = $("#change-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#change-ok").textContent = "";
    $("#change-error").textContent = "";
    if (!form.reportValidity()) return;
    const btn = $("button[type=submit]", form);
    busy(btn, true, "Saving…");
    const { ok, status, data } = await post(`${API}/reset-password`, { ...auth, password: form.password.value });
    busy(btn, false);
    if (!ok) {
      if (status === 401) { forgetAll(); return show("login", data.error); }
      $("#change-error").textContent = data.error || "Something went wrong.";
      return;
    }
    form.reset();
    $("#change-ok").textContent = "Password changed. Log in to the app again with the new one.";
  });
}

// ── Side panel: a live call log ─────────────────────────────────────────
// Every few seconds a lead lands on top as "Calling…", then gets its outcome; the oldest slides out.
const LEADS = ["Priya Nair", "Arjun Mehta", "Sneha Reddy", "Vikram Rao", "Kavya Iyer", "Rohan Das", "Pooja Shah", "Imran Khan", "Divya Menon", "Karan Gill", "Ritu Sharma", "Aditya Jain"];
const OUTCOMES = [["t-int", "Interested"], ["t-cb", "Callback · 5 PM"], ["t-no", "Not reachable"], ["t-int", "Sale closed"], ["t-cb", "Callback · tomorrow"], ["t-int", "Interested"]];
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function startTicker() {
  const list = $("#ticker");
  const count = $("#live-count");
  if (calm) return;
  let n = 0;
  setInterval(() => {
    if (document.hidden || !list.offsetParent) return; // background tab, dashboard or phone layout
    list.classList.add("rolling");
    const name = LEADS[n % LEADS.length];
    const [tone, outcome] = OUTCOMES[n++ % OUTCOMES.length];
    const box = list.getBoundingClientRect();
    const before = new Map($$("li", list).map((li) => [li, li.getBoundingClientRect()]));

    const li = document.createElement("li");
    li.className = "calling";
    li.innerHTML = `<span class="av">${name.split(" ").map((w) => w[0]).join("")}</span><b>${name}</b><em class="t-call">Calling…</em>`;
    list.prepend(li);

    // The oldest card fades out where it stood; the rest glide to their new places.
    const gone = list.lastElementChild;
    const r = before.get(gone);
    Object.assign(gone.style, { position: "absolute", margin: 0, top: `${r.top - box.top}px`, left: `${r.left - box.left}px`, width: `${r.width}px` });
    gone.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(18px) scale(0.95)" }], { duration: 500, easing: EASE }).onfinish = () => gone.remove();
    before.forEach((old, el) => {
      if (el === gone) return;
      const now = el.getBoundingClientRect();
      el.animate([{ transform: `translate(${old.left - now.left}px, ${old.top - now.top}px)` }, { transform: "none" }], { duration: 750, easing: EASE });
    });
    li.animate([{ opacity: 0, transform: "translateY(-16px) scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: 650, easing: EASE });

    setTimeout(() => {
      li.classList.remove("calling");
      const chip = $("em", li);
      chip.className = tone;
      chip.textContent = outcome;
      chip.animate([{ opacity: 0, transform: "scale(0.6)" }, { transform: "scale(1.08)", offset: 0.6 }, { opacity: 1, transform: "none" }], { duration: 450, easing: EASE });
      count.textContent = Number(count.textContent) + 1;
      count.animate([{ opacity: 0, transform: "translateY(-70%)" }, { opacity: 1, transform: "none" }], { duration: 400, easing: EASE });
    }, 1500);
  }, 3400);
}

// ── Start ───────────────────────────────────────────────────────────────
function initPasswordToggles() {
  $$(".pw button").forEach((btn) =>
    btn.addEventListener("click", () => {
      const input = btn.previousElementSibling;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.textContent = showing ? "Show" : "Hide";
      btn.setAttribute("aria-pressed", String(!showing));
    }),
  );
}

function initSignupCopy() {
  if (!wantedPlan) return;
  const p = PRICES[wantedPlan];
  $("#signup-title").textContent = `Get ${p.name}`;
  $("#signup-lead").textContent = `Pay ${rupees(p.base)}/month and start today. No trial needed.`;
}

/** Back from Cashfree after a Starter/Pro sign-up: the company exists once the payment webhook lands. */
function confirmCheckout(credential, tries = 0) {
  if (tries === 0) show("confirming");
  loadAccount({ credential }, {
    justSignedUp: true,
    noCompany: () => {
      if (tries < 20) return void setTimeout(() => confirmCheckout(credential, tries + 1), 3000);
      $("#confirm-title").textContent = "We haven't received your payment";
      $("#confirm-lead").textContent = "If you cancelled it, sign up again. If money was taken, your company shows up here within a few minutes: reload this page, or message us on WhatsApp.";
      $("#confirm-retry").hidden = false;
    },
  });
}

const fontIn = Promise.all(["400 1em 'Plus Jakarta Sans'", "800 1em 'Plus Jakarta Sans'"].map((f) => document.fonts.load(f)));
Promise.race([fontIn, new Promise((r) => setTimeout(r, 800))]).finally(() => document.documentElement.classList.add("ready"));
initPasswordToggles();
initPasswordLogin();
initSignup();
initReset();
initDashboard();
initSignupCopy();
initCheckout();
initPlaces();
renderGoogleButtons();
startTicker();
$$("[data-go]").forEach((b) => b.addEventListener("click", () => {
  if (b.dataset.go === "reset") { $("#reset-form").hidden = true; $("[data-google]", $('[data-step="reset"]')).hidden = false; }
  show(b.dataset.go);
}));

// Already logged in on this tab? Straight to the dashboard. Otherwise the step from the link:
// pricing "Choose Starter/Pro" → sign up for that plan; "Start free trial" → sign up; else log in.
const mode = params.get("mode");
const savedWeb = remembered("web");
const savedGoogle = remembered("google");
if (mode === "reset") show("reset");
else if (params.has("checkout") && savedGoogle) { google = savedGoogle; confirmCheckout(savedGoogle); }
else if (savedWeb) loadAccount({ token: savedWeb });
else if (savedGoogle) { google = savedGoogle; loadAccount({ credential: savedGoogle }, { noCompany: () => onGoogleSignup(savedGoogle) }); }
else show(mode === "signup" || wantedPlan ? "signup" : "login");
