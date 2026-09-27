// Sign-up and reset-password pages. Google signs the person in (verified email, no email of ours
// needed); the API checks Google's token again before creating anything.
const API = "https://api.callercrm.codebyakshay.com/api/signup";
const GOOGLE_CLIENT_ID = "135149357843-kh5reev4cvesdos3p1uvsq2b044edrdd.apps.googleusercontent.com";

const $ = (sel) => document.querySelector(sel);
let credential = null; // Google ID token, valid ~1 hour

function show(step) {
  document.querySelectorAll(".auth-step").forEach((el) => (el.hidden = el.dataset.step !== step));
  const heading = document.querySelector(`[data-step="${step}"] h2`);
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

const BILLING_API = "https://api.callercrm.codebyakshay.com/api/billing";

async function post(path, body, url = API + path) {
  let res;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, data: { error: "Couldn't reach CallerCRM. Check your internet and try again." } };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Google's token ran out (or was refused): back to the Google step with the reason.
// The Google sign-in is shared by the sign-up, account and reset pages for this tab, so the
// person picks their Google account once. Google's token is valid ~1 hour; we drop it a minute early.
const STORE_KEY = "callercrm.google";
function saveCredential(token) {
  try { sessionStorage.setItem(STORE_KEY, token); } catch { /* private mode: they'll sign in per page */ }
}
function savedCredential() {
  try {
    const token = sessionStorage.getItem(STORE_KEY);
    if (!token) return null;
    const { exp } = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (exp * 1000 > Date.now() + 60000) return token;
    sessionStorage.removeItem(STORE_KEY);
  } catch { /* unreadable: sign in again */ }
  return null;
}
function forgetCredential() {
  try { sessionStorage.removeItem(STORE_KEY); } catch { /* nothing stored */ }
}
const planQuery = () => {
  const plan = new URLSearchParams(location.search).get("plan");
  return plan === "starter" || plan === "pro" ? `?plan=${plan}` : "";
};

function restartGoogle(message) {
  credential = null;
  forgetCredential();
  $("#google-error").textContent = message;
  show("google");
}

function setBusy(form, busy, label) {
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = busy;
  btn.textContent = busy ? label : btn.dataset.label;
}

function initPasswordToggles() {
  document.querySelectorAll(".pw button").forEach((btn) =>
    btn.addEventListener("click", () => {
      const input = btn.previousElementSibling;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.textContent = showing ? "Show" : "Hide";
      btn.setAttribute("aria-pressed", String(!showing));
    }),
  );
}

// autoSelect: returning admins on the account page are signed straight back in (no website session to keep).
function initGoogle(onCredentialRaw, autoSelect = false) {
  const slot = $("#google-button");
  const onCredential = (token) => { saveCredential(token); onCredentialRaw(token); };
  const saved = savedCredential();
  if (saved) onCredentialRaw(saved); // already signed in on another page in this tab
  const start = () => {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (r) => onCredential(r.credential),
      ux_mode: "popup",
      auto_select: autoSelect,
      cancel_on_tap_outside: true,
    });
    google.accounts.id.renderButton(slot, {
      theme: "outline", size: "large", shape: "pill", text: "continue_with", logo_alignment: "center",
      width: Math.min(340, slot.clientWidth || 340),
    });
    if (autoSelect && !saved) google.accounts.id.prompt();
  };
  if (window.google?.accounts?.id) start();
  else window.addEventListener("google-loaded", start, { once: true });
}
window.onGoogleLibraryLoad = () => window.dispatchEvent(new Event("google-loaded"));

// ── Sign up ─────────────────────────────────────────────────────────────
const PLANS = { starter: "Starter (₹249/month)", pro: "Pro (₹499/month)" };

function initSignup() {
  const form = $("#signup-form");
  const picked = PLANS[new URLSearchParams(location.search).get("plan")];
  if (picked) {
    $("#plan-pick").textContent = `You picked ${picked}. Start with 14 days free of every Pro feature, then pay for your plan from your account.`;
    $("#plan-pick").hidden = false;
  }

  initGoogle(async (token) => {
    $("#google-error").textContent = "";
    const { ok, data } = await post("/check", { credential: token });
    if (!ok) return restartGoogle(data.error || "Google sign-in didn't work. Please try again.");
    credential = token;
    if (data.exists) {
      // Already has a company: their account page (plan picker) is where they want to be.
      location.replace(`/account/${planQuery()}`);
      return;
    }
    $("#who-email").textContent = data.email;
    if (!form.name.value) form.name.value = data.name || "";
    show("details");
  });

  $("#change-google").addEventListener("click", () => restartGoogle(""));

  // One trial per mobile number: say so as soon as the number is typed, not after the whole form.
  const phone = form.phone;
  phone.addEventListener("input", () => { phone.setCustomValidity(""); $("#phone-error").textContent = ""; });
  phone.addEventListener("change", async () => {
    if (!credential || phone.value.replace(/\D/g, "").length < 10) return;
    const { ok, data } = await post("/check", { credential, phone: phone.value });
    if (ok && data.phoneTaken) {
      const msg = "This number already has a CallerCRM company (one free trial per number). Use another number.";
      phone.setCustomValidity(msg);
      $("#phone-error").textContent = msg;
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = $("#signup-error");
    error.textContent = "";
    if (!form.reportValidity()) return;
    setBusy(form, true, "Starting your trial…");
    const f = new FormData(form);
    const { ok, status, data } = await post("", {
      credential,
      companyName: f.get("companyName"),
      name: f.get("name"),
      phone: f.get("phone"),
      city: f.get("city"),
      teamSize: f.get("teamSize"),
      gstNumber: f.get("gstNumber"),
      username: f.get("username"),
      password: f.get("password"),
    });
    setBusy(form, false);
    if (!ok) {
      if (status === 401) return restartGoogle(data.error);
      error.textContent = data.error || "Something went wrong. Please try again.";
      return;
    }
    $("#done-email").textContent = data.email;
    $("#done-username").textContent = data.username;
    const ends = new Date(data.trialEndsAt);
    $("#done-ends").textContent = ends.toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
    const wa = `Hi, I just signed up for CallerCRM (${f.get("companyName")}). I'd like to connect our WhatsApp Business number.`;
    $("#done-whatsapp").href = `https://wa.me/917898131225?text=${encodeURIComponent(wa)}`;
    $("#done-pay").href = `/account/${planQuery()}`;
    show("done");
  });
}

// ── Reset password ──────────────────────────────────────────────────────
function initReset() {
  const form = $("#reset-form");

  initGoogle(async (token) => {
    $("#google-error").textContent = "";
    const { ok, data } = await post("/check", { credential: token });
    if (!ok) return restartGoogle(data.error || "Google sign-in didn't work. Please try again.");
    credential = token;
    if (!data.exists) {
      $("#none-email").textContent = data.email;
      return show("none");
    }
    $("#who-email").textContent = data.email;
    show("password");
  });

  $("#change-google").addEventListener("click", () => restartGoogle(""));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = $("#reset-error");
    error.textContent = "";
    if (!form.reportValidity()) return;
    setBusy(form, true, "Saving…");
    const { ok, status, data } = await post("/reset-password", { credential, password: new FormData(form).get("password") });
    setBusy(form, false);
    if (!ok) {
      if (status === 401) return restartGoogle(data.error);
      error.textContent = data.error || "Something went wrong. Please try again.";
      return;
    }
    $("#done-email").textContent = data.email;
    $("#done-username").textContent = data.username;
    show("done");
  });
}

// ── Payments (account page) ─────────────────────────────────────────────
// Same prices as the pricing section and the server (src/lib/pricing.ts). The server sets the real amount.
const PRICES = { STARTER: { name: "Starter", base: 249, seats: 10, pack: 69 }, PRO: { name: "Pro", base: 499, seats: 12, pack: 85 } };
const rupees = (n) => `₹${n.toLocaleString("en-IN")}`;
const bill = { plan: "PRO", interval: "MONTH", packs: 0, paidUntil: null, discount: 0 };
const dayKey = (d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const addDaysKey = (key, n) => dayKey(new Date(Date.parse(`${key}T12:00:00+05:30`) + n * 864e5));

// Same rounding as the server: founding discount off the full price, to the nearest rupee.
function priceOf(plan, interval, packs, discount = bill.discount) {
  const monthly = PRICES[plan].base + packs * PRICES[plan].pack;
  const full = interval === "YEAR" ? monthly * 10 : monthly;
  return Math.round((full * (100 - discount)) / 100);
}

function drawPicker() {
  const per = bill.interval === "YEAR" ? "/year" : "/month";
  document.querySelectorAll("[data-price]").forEach((el) => (el.textContent = rupees(priceOf(el.dataset.price, bill.interval, 0)) + per));
  document.querySelectorAll("[data-interval]").forEach((b) => {
    const on = b.dataset.interval === bill.interval;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  const p = PRICES[bill.plan];
  const packPrice = Math.round(((bill.interval === "YEAR" ? p.pack * 10 : p.pack) * (100 - bill.discount)) / 100);
  $("#bill-pack-price").textContent = `Packs of 5, ${rupees(packPrice)}${per} each`;
  $("#bill-extra").textContent = `+${bill.packs * 5}`;
  $("#bill-minus").disabled = bill.packs === 0;
  $("#bill-plus").disabled = bill.packs === 20;
  $("#bill-callers").textContent = `${p.seats + bill.packs * 5} callers`;
  $("#bill-total").textContent = rupees(priceOf(bill.plan, bill.interval, bill.packs)) + per;
  $("#bill-discount").hidden = !bill.discount;
  $("#bill-discount").textContent = `Founding customer price: ${bill.discount}% off, for as long as you stay.`;
  // Mirrors the server: the day after the trial / paid period, at least 2 days out (UPI pre-debit notice).
  const earliest = addDaysKey(dayKey(new Date()), 2);
  const after = bill.paidUntil ? addDaysKey(bill.paidUntil, 1) : earliest;
  const first = after > earliest ? after : earliest;
  $("#bill-first").textContent = `Nothing is charged today (₹1 is checked and refunded). First charge on ${niceDay(first)}, then every ${bill.interval === "YEAR" ? "year" : "month"}.`;
}

function initPicker() {
  document.querySelectorAll("[data-interval]").forEach((b) =>
    b.addEventListener("click", () => { bill.interval = b.dataset.interval; drawPicker(); }));
  document.querySelectorAll('input[name="bill-plan"]').forEach((r) =>
    r.addEventListener("change", () => { bill.plan = r.value; drawPicker(); }));
  $("#bill-minus").addEventListener("click", () => { bill.packs = Math.max(0, bill.packs - 1); drawPicker(); });
  $("#bill-plus").addEventListener("click", () => { bill.packs = Math.min(20, bill.packs + 1); drawPicker(); });

  $("#bill-go").addEventListener("click", async () => {
    const btn = $("#bill-go");
    $("#bill-error").textContent = "";
    btn.disabled = true;
    btn.textContent = "Opening secure payment…";
    const { ok, status, data } = await post("", { credential, plan: bill.plan, interval: bill.interval, extraPacks: bill.packs }, BILLING_API + "/subscribe");
    const reset = () => { btn.disabled = false; btn.textContent = "Continue to payment"; };
    if (!ok) {
      reset();
      if (status === 401) return restartGoogle(data.error);
      $("#bill-error").textContent = data.error || "Couldn't start the payment. Please try again.";
      return;
    }
    if (!window.Cashfree) {
      reset();
      $("#bill-error").textContent = "The payment page didn't load. Check your internet, reload, and try again.";
      return;
    }
    const result = await window.Cashfree({ mode: data.mode }).subscriptionsCheckout({ subsSessionId: data.sessionId, redirectTarget: "_self" });
    if (result?.error) {
      reset();
      $("#bill-error").textContent = result.error.message || "The payment page didn't open. Please try again.";
    }
  });

  $("#bill-cancel").addEventListener("click", async () => {
    if (!confirm("Stop automatic payments? Your plan keeps working until its end date, then the account turns read-only unless you pay again.")) return;
    $("#bill-cancel-error").textContent = "";
    const { ok, status, data } = await post("", { credential }, BILLING_API + "/cancel");
    if (!ok) {
      if (status === 401) return restartGoogle(data.error);
      $("#bill-cancel-error").textContent = data.error || "Couldn't cancel. Please try again.";
      return;
    }
    location.reload();
  });

  const wanted = new URLSearchParams(location.search).get("plan");
  if (wanted === "starter" || wanted === "pro") {
    bill.plan = wanted.toUpperCase();
    document.querySelector(`input[name="bill-plan"][value="${bill.plan}"]`).checked = true;
  }
}

function renderBilling(data) {
  bill.paidUntil = data.paidUntil;
  bill.discount = data.discountPct || 0;
  const sub = data.subscription;
  $("#bill-active").hidden = !sub;
  $("#bill-pick").hidden = Boolean(sub) || data.suspended;
  if (sub) {
    const extra = sub.extraPacks ? ` + ${sub.extraPacks * 5} callers` : "";
    $("#bill-active-plan").textContent = `${PRICES[sub.plan]?.name ?? sub.plan}${extra}`;
    $("#bill-active-price").textContent = rupees(sub.amount) + (sub.interval === "YEAR" ? "/year" : "/month");
    const next = data.payments.length ? addDaysKey(data.paidUntil, 1) : sub.firstChargeDay;
    $("#bill-next").textContent = niceDay(next);
  } else {
    $("#bill-pick-title").textContent = data.plan === "TRIAL" ? "Choose your plan" : "Pay for your plan";
    drawPicker();
    // Online payments not switched on for this company yet: same picker, paid on WhatsApp.
    $("#bill-go").hidden = !data.paymentsOpen;
    $("#bill-wa").hidden = data.paymentsOpen;
    if (!data.paymentsOpen) {
      const updateWa = () => {
        const per = bill.interval === "YEAR" ? "yearly" : "monthly";
        const msg = `Hi, I'd like to pay for CallerCRM.\nCompany: ${data.company}\nLogin: ${data.email}\nPlan: ${PRICES[bill.plan].name} ${per}, ${PRICES[bill.plan].seats + bill.packs * 5} callers (${$("#bill-total").textContent})`;
        $("#bill-wa").href = `https://wa.me/917898131225?text=${encodeURIComponent(msg)}`;
      };
      updateWa();
      $("#bill-pick").addEventListener("click", () => setTimeout(updateWa));
    }
  }
  $("#bill-history").hidden = !data.payments.length;
  $("#bill-list").replaceChildren(
    ...data.payments.map((p) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${niceDay(p.paidOn)}</span><span><b>${rupees(p.amount)}</b> · covers to ${niceDay(p.coversUntil)}</span>`;
      return li;
    }),
  );
  if (new URLSearchParams(location.search).has("subscription") && !sub) {
    const note = $("#acc-return");
    note.textContent = "Thanks! If you approved the payment, it can take a minute to show here. Reload the page in a minute.";
    note.hidden = false;
  } else if (new URLSearchParams(location.search).has("subscription")) {
    const note = $("#acc-return");
    note.textContent = "Automatic payments are on. You're all set.";
    note.hidden = false;
  }
}

// ── Account ─────────────────────────────────────────────────────────────
const PLAN_LABEL = { TRIAL: "Free trial · every Pro feature", STARTER: "Starter plan", PRO: "Pro plan" };
const niceDay = (key) =>
  new Date(`${key}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

function initAccount() {
  const form = $("#reset-form");
  initPicker();

  initGoogle(async (token) => {
    $("#google-error").textContent = "";
    const { ok, status, data } = await post("/account", { credential: token });
    if (status === 404) {
      // No company for this Google account yet: create it (same Google sign-in, no second prompt).
      location.replace(`/signup/${planQuery()}`);
      return;
    }
    if (!ok) return restartGoogle(data.error || "Google sign-in didn't work. Please try again.");
    credential = token;
    $("#acc-plan").textContent = PLAN_LABEL[data.plan] || data.plan;
    $("#acc-company").textContent = data.company;
    const st = $("#acc-status");
    st.className = "acc-status";
    if (data.suspended) {
      st.classList.add("bad");
      st.textContent = "This account is suspended. Message us on WhatsApp.";
    } else if (data.notice) {
      st.classList.add(data.notice.tone === "bad" ? "bad" : "warn");
      st.textContent = `${data.notice.title}. ${data.notice.text}`;
    } else if (data.paidUntil) {
      st.textContent = data.plan === "TRIAL" ? `Trial runs until ${niceDay(data.paidUntil)}.` : `Paid until ${niceDay(data.paidUntil)}.`;
    } else {
      st.textContent = "Active.";
    }
    $("#acc-callers").textContent = data.seatLimit ? `${data.callers} of ${data.seatLimit} in use` : `${data.callers} in use`;
    $("#acc-email").textContent = data.email;
    $("#acc-username").textContent = data.username;
    $("#who-email").textContent = data.email;
    renderBilling(data);
    show("account");
    // Came from "Choose Starter/Pro": take them straight to the plan picker.
    if (new URLSearchParams(location.search).has("plan") && !$("#bill-pick").hidden) {
      setTimeout(() => $("#bill-pick").scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, true);

  $("#acc-password-toggle").addEventListener("click", () => {
    form.hidden = !form.hidden;
    if (!form.hidden) form.password.focus();
  });
  document.querySelectorAll("[data-signout]").forEach((b) =>
    b.addEventListener("click", () => {
      window.google?.accounts?.id?.disableAutoSelect();
      restartGoogle("");
    }),
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#reset-error").textContent = "";
    $("#reset-saved").textContent = "";
    if (!form.reportValidity()) return;
    setBusy(form, true, "Saving…");
    const { ok, status, data } = await post("/reset-password", { credential, password: form.password.value });
    setBusy(form, false);
    if (!ok) {
      if (status === 401) return restartGoogle(data.error);
      $("#reset-error").textContent = data.error || "Something went wrong. Please try again.";
      return;
    }
    form.reset();
    $("#reset-saved").textContent = "Password saved. Log in to the app again with the new password.";
  });
}

document.querySelectorAll("button[type=submit]").forEach((b) => (b.dataset.label = b.textContent));
initPasswordToggles();
if (document.body.dataset.page === "signup") initSignup();
if (document.body.dataset.page === "reset") initReset();
if (document.body.dataset.page === "account") initAccount();
