"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { formatName, normalizeToken } from "@/lib/pickup";
import { LANGUAGES, pickLang, isRtl } from "@/lib/i18n/languages";
import { tr } from "@/lib/i18n/pickup";

const LANG_KEY = "keymatic.lang";

/** Language: ?lang=xx, else the guest's last choice, else the phone's language. */
function initialLang() {
  if (typeof window === "undefined") return "en";
  const fromUrl = new URLSearchParams(window.location.search).get("lang");
  if (fromUrl) return pickLang(fromUrl);
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved) return pickLang(saved);
  } catch {}
  return pickLang(window.navigator?.language);
}

function LanguageMenu({ lang, onChange, label }) {
  return (
    <label className="flex items-center gap-2 text-sm text-white/80">
      <span className="sr-only">{label}</span>
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
      </svg>
      <select
        value={lang}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white/10 border border-white/30 rounded-lg px-2 py-1 text-white"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code} className="text-black">
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** POST to one of this link's server routes; returns { status, body }. */
async function postLink(token, path, payload) {
  const res = await fetch(`/api/pickup-link/${encodeURIComponent(token)}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

export default function Page() {
  const { token } = useParams();
  const linkToken = normalizeToken(token);

  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [expiredReason, setExpiredReason] = useState(null);
  const [error, setErrorState] = useState(null); // { k, v, field }
  const setError = (k, v, field) => setErrorState(k ? { k, v, field } : null);
  const [lang, setLangState] = useState("en");
  const t = (k, v) => tr(lang, k, v);
  function setLang(code) {
    const c = pickLang(code);
    setLangState(c);
    try {
      window.localStorage.setItem(LANG_KEY, c);
    } catch {}
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("lang", c);
      window.history.replaceState(null, "", u.toString());
    } catch {}
  }
  const [checking, setChecking] = useState(false);

  const [data, setData] = useState(null);
  const [step, setStep] = useState("welcome");

  const [lastName, setLastName] = useState("");
  const [machineId, setMachineId] = useState(["", "", ""]);
  const [focusedIndex, setFocusedIndex] = useState(null);
  const [showKeypad, setShowKeypad] = useState(false);

  // NEW: hint toggle state
  const [showHint, setShowHint] = useState(false);

  // API states
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiErrorState] = useState(null); // translation key
  const setApiError = (k) => setApiErrorState(k || null);
  const [keyReleased, setKeyReleased] = useState(false);
  const [apiDetail, setApiDetail] = useState("");

  const pin0 = useRef(null);
  const pin1 = useRef(null);
  const pin2 = useRef(null);
  const pinRefs = useMemo(() => [pin0, pin1, pin2], []);
  const pageRef = useRef(null);
  const keypadRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);

      try {
        if (!linkToken) {
          setError("notFound");
          return;
        }

        const res = await fetch(`/api/pickup-link/${encodeURIComponent(linkToken)}`, { cache: "no-store" });
        const payload = await res.json().catch(() => ({}));
        if (mounted) setLangState(initialLang());
        if (!res.ok) {
          setError(res.status === 404 ? "notFound" : "couldNotLoad");
          return;
        }
        const b = payload.booking || {};

        if (b.state === "used") {
          setExpired(true);
          setExpiredReason("invalid");
        } else if (b.state === "expired") {
          setExpired(true);
          setExpiredReason("time");
        } else if (b.state === "notyet") {
          setExpired(true);
          setExpiredReason("notyet");
        }
        if (!mounted) return;

        setData({
          city: b.city || "",
          machineAddress: b.machineAddress || "",
          machineName: b.machineName || "-",
          roomNo: b.roomNo ?? null,
          platform: b.platform || "",
          clientFirstName: b.clientFirstName || "",
          checkIn: b.checkIn || null,
        });
      } catch (e) {
        console.error("[pickup] load failed:", e);
        setError("couldNotLoad");
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [linkToken]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const target = event.target;
      const clickedInsideMachineId = pinRefs.some((ref) => ref.current && ref.current.contains(target));
      const clickedInsideKeypad = keypadRef.current && keypadRef.current.contains(target);
      if (!clickedInsideMachineId && !clickedInsideKeypad) {
        setShowKeypad(false);
        setFocusedIndex(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pinRefs]);

  useEffect(() => {
    if (focusedIndex !== null) {
      pinRefs[focusedIndex]?.current?.focus();
      keypadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusedIndex, pinRefs]);

  useEffect(() => {
    if (step === "closeDoor") {
      const timer = setTimeout(() => setStep("success"), 5000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  function handleKeypadClick(value) {
    if (value === "⌫") {
      handleBackspace();
      return;
    }
    if (focusedIndex !== null && focusedIndex < 3) {
      const next = [...machineId];
      next[focusedIndex] = value.toUpperCase();
      setMachineId(next);
      setError(null);
      keypadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

      if (focusedIndex < 2) setFocusedIndex(focusedIndex + 1);
      else {
        setFocusedIndex(null);
        setShowKeypad(false);
      }
    }
  }

  function handleBackspace() {
    if (focusedIndex !== null && focusedIndex >= 0) {
      const next = [...machineId];
      if (next[focusedIndex]) {
        next[focusedIndex] = "";
      } else if (focusedIndex > 0) {
        setFocusedIndex(focusedIndex - 1);
        pinRefs[focusedIndex - 1].current?.focus();
        next[focusedIndex - 1] = "";
      }
      setMachineId(next);
      setError(null);
      setShowKeypad(true);
      keypadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  const answersComplete = lastName.trim() !== "" && machineId.every((c) => c.trim() !== "");

  /** Send the guest's answers to the server, which decides. */
  async function handleVerify() {
    if (!answersComplete || checking) return;
    setChecking(true);
    setError(null);
    try {
      const { status, body } = await postLink(linkToken, "verify", {
        lastName: lastName.trim(),
        machineId: machineId.join(""),
      });
      if (body.ok) {
        setStep("openDoor");
        return;
      }
      if (status === 410) {
        setExpired(true);
        setExpiredReason(body.state === "used" ? "invalid" : body.state === "notyet" ? "notyet" : "time");
        return;
      }
      const code = body.code || "couldNotCheck";
      const field = code === "wrong_name" ? "name" : code === "wrong_id" ? "id" : code === "wrong_both" ? "both" : null;
      setError(
        code === "couldNotCheck" ? "err.couldNotCheck" : `err.${code}`,
        { n: body.minutes, left: body.triesLeft },
        field
      );
    } catch {
      setError("err.network");
    } finally {
      setChecking(false);
    }
  }

  /** Ask the server to run one machine step. Returns the result word. */
  async function runAction(action) {
    const { status, body } = await postLink(linkToken, "action", { action });
    if (body.reason) console.warn("[pickup]", action, body.reason);
    setApiDetail(body.reason ? String(body.reason).slice(0, 60) : "");
    if (status === 401) {
      // The check expired (more than a few minutes passed). Ask again.
      setStep("confirm");
      setError("err.reverify");
      return "unverified";
    }
    if (status === 410) {
      setExpired(true);
      setExpiredReason(body.state === "used" ? "invalid" : body.state === "notyet" ? "notyet" : "time");
      return "closed";
    }
    return body.result || "error";
  }

  async function handleOpenDoor() {
    setApiLoading(true);
    setApiError(null);
    try {
      const result = await runAction("open");
      if (result === "open") setStep("releaseKey");
      else if (result === "blocked") setApiError("err.blocked");
      else if (result === "offline") setApiError("err.offline");
      else if (result === "unknown") setApiError("err.doorUnknown");
      else if (result === "error") setApiError("err.generic");
    } catch {
      setApiError("err.network");
    } finally {
      setApiLoading(false);
    }
  }

  /** Is the key out yet? Finishes the pickup on the server when it is. */
  async function checkKey() {
    const result = await runAction("check");
    if (result === "taken") setStep("closeDoor");
    else if (result === "still_in") setApiError("err.stillIn");
    else if (result === "offline") setApiError("err.offline");
    else if (result === "unknown") setApiError("err.keyUnknown");
    else if (result === "error") setApiError("err.generic");
    return result;
  }

  async function handleReleaseKey() {
    setApiLoading(true);
    setApiError(null);
    try {
      if (keyReleased) {
        await checkKey();
        return;
      }
      const result = await runAction("release");
      if (result === "released") {
        setKeyReleased(true);
        // Give the hardware time to move, then check the slot.
        await new Promise((res) => setTimeout(res, 5000));
        await checkKey();
      } else if (result === "offline") setApiError("err.offline");
      else if (result === "error") setApiError("err.generic");
    } catch {
      setApiError("err.network");
    } finally {
      setApiLoading(false);
    }
  }

  const dir = isRtl(lang) ? "rtl" : "ltr";
  const langMenu = <LanguageMenu lang={lang} onChange={setLang} label={t("language")} />;
  const errText = error
    ? t(error.k, error.v) + (typeof error.v?.left === "number" ? ` (${t("err.triesLeft", { n: error.v.left })})` : "")
    : "";
  const nameBad = error?.field === "name" || error?.field === "both";
  const idBad = error?.field === "id" || error?.field === "both";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-700 to-blue-900 text-white">
        <p className="text-lg">{t("loading")}</p>
      </div>
    );
  }

  if (expired) {
    const title =
      expiredReason === "invalid"
        ? t("invalidTitle")
        : expiredReason === "notyet"
          ? t("notYetTitle")
          : t("expiredTitle");
    const msg =
      expiredReason === "invalid"
        ? t("invalidMsg")
        : expiredReason === "notyet"
          ? t("notYetMsg", { time: data?.checkIn ? ` (${new Date(data.checkIn).toLocaleString(lang)})` : "" })
          : t("expiredMsg");
    return (
      <div
        dir={dir}
        lang={lang}
        className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-red-700 to-red-900 text-white p-6 gap-6"
      >
        {langMenu}
        <h1 className="text-5xl font-bold text-center">{title}</h1>
        <p className="text-lg text-center">{msg}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        dir={dir}
        lang={lang}
        className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-700 to-blue-900 text-white p-6 gap-6"
      >
        {langMenu}
        <h1 className="text-5xl font-bold">{t("errorTitle")}</h1>
        <p className="text-lg text-center">{error ? t(error.k) : t("errorMsg")}</p>
      </div>
    );
  }

  return (
    <div
      ref={pageRef}
      dir={dir}
      lang={lang}
      className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-700 to-blue-900 text-white px-4 py-8 relative"
    >
      <div className="mb-6">{langMenu}</div>

      {step !== "welcome" && (
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight mb-2">🔑 {t("header")}</h1>
          <p className="text-white/80">{t("welcomeName", { name: formatName(data?.clientFirstName) })}</p>
        </div>
      )}

      {step !== "welcome" && (
        <div className="text-center mb-6">
          <p className="mb-1">
            {t("keyForRoom")}: <span className="font-semibold">{data?.roomNo}</span>
          </p>
          <p>
            {t("machine")}: <span className="font-semibold">{data?.machineName}</span>
            {data?.city && ` · ${data.city}`}
          </p>
        </div>
      )}

      {step === "welcome" && (
        <div className="w-full max-w-md">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/15 shadow-lg text-center space-y-4">
            <p className="text-xs tracking-widest uppercase text-white/70">{t("brand")} 🔑</p>

            <h1 className="text-4xl font-extrabold tracking-tight text-white">{t("welcome")}</h1>
            <p className="text-3xl font-bold text-white">{formatName(data?.clientFirstName)}</p>

            <div className="text-sm leading-relaxed text-white/90 space-y-1">
              <p>{t("confirmFollowing")}</p>
              {(data?.city || data?.machineAddress) && (
                <p>
                  📍 {t("city")}: <strong>{data?.city || "-"}</strong>
                  {data?.machineAddress && ` — ${data.machineAddress}`}
                </p>
              )}
              <p>
                🏷️ {t("machineName")}: <strong>{formatName(data?.machineName) || "-"}</strong>
              </p>
              <p>
                🔑 {t("room")}: <strong>{data?.roomNo ?? "-"}</strong>
              </p>
              {data?.platform && (
                <p>
                  🖥️ {t("platform")}: <strong>{data.platform}</strong>
                </p>
              )}
            </div>

            <p className="text-sm text-white/85">💡 {t("aboutTo")}</p>
            <p className="text-sm text-white/85">⚡ {t("underMinute")}</p>

            <button
              onClick={() => setStep("confirm")}
              className="mt-4 w-full bg-white text-blue-900 font-semibold py-2 rounded-lg hover:bg-blue-100 transition"
            >
              ✅ {t("start")}
            </button>

            <p className="text-xs text-white/60">🕒 {t("notAtMachine")}</p>
            <a
              href={`/how-it-works?lang=${lang}&t=${encodeURIComponent(linkToken)}`}
              className="inline-block text-sm underline text-blue-100 hover:text-white"
            >
              {t("howItWorks")}
            </a>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="w-full max-w-xs text-center">
          <label className="block mb-2 text-lg font-medium" htmlFor="lastName">
            {t("lastNameTitle")}
          </label>
          <input
            id="lastName"
            type="text"
            placeholder={t("lastNamePlaceholder")}
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value);
              setError(null);
            }}
            className={`p-2 border rounded-lg w-full mb-3 text-white placeholder-gray-300 text-center focus:outline-none focus:ring-2 ${
              nameBad
                ? "border-red-500 bg-red-900/20 focus:ring-red-500"
                : "border-gray-300 focus:ring-white focus:border-blue-900"
            }`}
          />

          <div className="mb-2 flex items-center justify-between">
            <p className="text-lg font-medium">{t("machineIdTitle")}</p>
            <button
              type="button"
              onClick={() => setShowHint((v) => !v)}
              className="text-sm underline text-blue-200 hover:text-white"
            >
              {showHint ? t("hideHint") : t("showHint")}
            </button>
          </div>
          {showHint && (
            <div className="mt-2 mb-2 flex flex-col items-center gap-1">
              <Image
                src="/MachineID.jpg"
                alt={t("stickerAlt")}
                width={484}
                height={788}
                className="w-32 h-auto rounded-lg border border-white/30 shadow bg-white"
              />
              <p className="text-xs text-white/80">{t("stickerAlt")}</p>
            </div>
          )}

          <div dir="ltr" className="flex justify-center gap-1 mb-1">
            {machineId.map((char, idx) => (
              <input
                key={idx}
                type="text"
                value={char}
                maxLength={1}
                aria-label={`${t("machineIdTitle")} ${idx + 1}`}
                onFocus={() => {
                  setFocusedIndex(idx);
                  setShowKeypad(true);
                }}
                ref={pinRefs[idx]}
                readOnly
                className={`w-20 h-20 text-center text-black rounded-lg text-xl placeholder-gray-400 bg-white transition focus:outline-none ${
                  idBad
                    ? "border-2 border-red-500 bg-red-100"
                    : focusedIndex === idx
                      ? "ring-4 ring-blue-900 border-blue-900"
                      : "border border-gray-300"
                }`}
                placeholder="•"
              />
            ))}
          </div>

          {showKeypad && (
            <div
              ref={keypadRef}
              dir="ltr"
              className="bg-white bg-opacity-20 backdrop-blur-lg p-3 rounded-2xl shadow-xl mt-3"
            >
              <div className="grid grid-cols-3 gap-y-3 gap-x-3 justify-items-center">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "0", "B", "C", "D", "⌫"].map((btn, idx) => (
                  <button
                    key={idx}
                    onClick={() => btn && handleKeypadClick(btn)}
                    disabled={!btn}
                    aria-label={btn === "⌫" ? "Delete" : undefined}
                    className={`w-20 h-20 flex items-center justify-center rounded-full text-2xl font-semibold ${
                      btn === "⌫"
                        ? "text-white bg-red-500 hover:bg-red-600"
                        : "text-gray-800 bg-gray-100 hover:bg-gray-200"
                    } shadow active:scale-95 transition`}
                  >
                    {btn}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleVerify}
            disabled={!answersComplete || checking}
            className="mt-4 w-full bg-white text-blue-900 font-semibold py-2 rounded-lg hover:bg-blue-100 transition disabled:opacity-50"
          >
            {checking ? t("checking") : t("continue")}
          </button>

          {error && (
            <p className="text-red-300 mt-2 font-medium bg-red-900/30 px-4 py-2 rounded-lg border border-red-500">
              {errText}
            </p>
          )}
        </div>
      )}

      {step === "openDoor" && (
        <div className="mt-5 text-center w-full max-w-xs">
          <button
            onClick={handleOpenDoor}
            disabled={apiLoading}
            className="bg-white hover:bg-blue-100 text-blue-900 font-bold py-2 px-4 rounded-lg w-full transition transform active:scale-95 disabled:opacity-50"
          >
            {apiLoading ? t("opening") : t("openDoor")}
          </button>
          {apiError && <p className="text-red-300 mt-2">{t(apiError)}</p>}
          {apiError && apiDetail && (
            <p dir="ltr" className="text-white/50 text-xs mt-1">
              {t("code")}: {apiDetail}
            </p>
          )}
        </div>
      )}

      {step === "releaseKey" && (
        <div className="mt-5 text-center w-full max-w-xs">
          <button
            onClick={handleReleaseKey}
            disabled={apiLoading}
            className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg w-full transition transform active:scale-95 disabled:opacity-50"
          >
            {apiLoading ? t("releasing") : keyReleased ? `✅ ${t("tookKey")}` : `🔑 ${t("releaseKey")}`}
          </button>
          {apiError && <p className="text-red-300 mt-2">{t(apiError)}</p>}
          {apiError && apiDetail && (
            <p dir="ltr" className="text-white/50 text-xs mt-1">
              {t("code")}: {apiDetail}
            </p>
          )}
        </div>
      )}

      {step === "closeDoor" && (
        <div className="mt-5 text-center w-full max-w-xs">
          <p className="text-xl mb-3 text-blue-200">✅ {t("keyReleased")}</p>
          <p className="text-lg">{t("closeDoor")}</p>
          <p className="mt-3 text-sm text-gray-200 animate-pulse">{t("waitingDoor")}</p>
        </div>
      )}

      {step === "success" && (
        <div className="mt-6 text-center">
          <h2 className="text-2xl font-bold mb-3 text-green-300">{t("thankYou")}</h2>
          <p className="text-lg">{t("complete")}</p>
        </div>
      )}
    </div>
  );
}
