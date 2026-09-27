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

async function post(path, body) {
  let res;
  try {
    res = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, data: { error: "Couldn't reach CallerCRM. Check your internet and try again." } };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Google's token ran out (or was refused): back to the Google step with the reason.
function restartGoogle(message) {
  credential = null;
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
function initGoogle(onCredential, autoSelect = false) {
  const slot = $("#google-button");
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
    if (autoSelect) google.accounts.id.prompt();
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
      $("#exists-login").textContent = data.email;
      $("#exists-username").textContent = data.username;
      return show("exists");
    }
    $("#who-email").textContent = data.email;
    if (!form.name.value) form.name.value = data.name || "";
    show("details");
  });

  $("#change-google").addEventListener("click", () => restartGoogle(""));

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

// ── Account ─────────────────────────────────────────────────────────────
const PLAN_LABEL = { TRIAL: "Free trial · every Pro feature", STARTER: "Starter plan", PRO: "Pro plan" };
const niceDay = (key) =>
  new Date(`${key}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

function initAccount() {
  const form = $("#reset-form");

  initGoogle(async (token) => {
    $("#google-error").textContent = "";
    const { ok, status, data } = await post("/account", { credential: token });
    if (status === 404) {
      $("#none-email").textContent = data.email || "This Google account";
      return show("none");
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
    const msg = `Hi, I'd like to pay for CallerCRM.\nCompany: ${data.company}\nLogin: ${data.email}\nPlan (Starter / Pro, monthly / yearly): `;
    $("#acc-pay").href = `https://wa.me/917898131225?text=${encodeURIComponent(msg)}`;
    show("account");
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
