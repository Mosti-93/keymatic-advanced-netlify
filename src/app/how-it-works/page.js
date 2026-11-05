import Image from "next/image";
import Link from "next/link";
import { LANGUAGES, pickLang, isRtl } from "@/lib/i18n/languages";
import { HOW_IT_WORKS } from "@/lib/i18n/howItWorks";

export const metadata = { title: "How KeyMatic works" };

// Pickup link tokens are UUIDs; anything else is ignored.
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /how-it-works?lang=xx&t=<pickup token>
 * Works with or without a booking: with a token it shows a button to that pickup link.
 */
export default async function HowItWorksPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const lang = pickLang(sp.lang);
  const token = TOKEN_RE.test(String(sp.t || "")) ? String(sp.t) : null;
  const t = HOW_IT_WORKS[lang];
  const dir = isRtl(lang) ? "rtl" : "ltr";
  const href = (code) => `/how-it-works?lang=${code}${token ? `&t=${token}` : ""}`;

  return (
    <main
      dir={dir}
      lang={lang}
      className="min-h-screen bg-gradient-to-br from-blue-700 to-blue-900 text-white px-4 py-8 flex justify-center"
    >
      <div className="w-full max-w-md space-y-5">
        <nav aria-label={t.chooseLanguage} className="flex flex-wrap justify-center gap-2">
          {LANGUAGES.map((l) => (
            <Link
              key={l.code}
              href={href(l.code)}
              lang={l.code}
              aria-current={l.code === lang ? "true" : undefined}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                l.code === lang
                  ? "bg-white text-blue-900 border-white font-semibold"
                  : "border-white/40 text-white hover:bg-white/10"
              }`}
            >
              {l.name}
            </Link>
          ))}
        </nav>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/15 shadow-lg space-y-5">
          <div className="text-center space-y-2">
            <p className="text-xs tracking-widest uppercase text-white/70">KEYMATIC</p>
            <h1 className="text-3xl font-extrabold">{t.title}</h1>
            <p className="text-white/90">{t.intro}</p>
          </div>

          <ol className="space-y-3">
            {t.steps.map((s, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="shrink-0 w-8 h-8 rounded-full bg-white text-blue-900 font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="pt-1 leading-snug">{s}</span>
              </li>
            ))}
          </ol>

          <figure className="flex flex-col items-center gap-2">
            <Image
              src="/MachineID.jpg"
              alt={t.stickerCaption}
              width={484}
              height={788}
              className="w-32 h-auto rounded-lg border border-white/30 bg-white"
            />
            <figcaption className="text-sm text-white/85 text-center">{t.stickerCaption}</figcaption>
          </figure>

          <div className="space-y-1 text-sm text-white/90">
            <p className="font-semibold">{t.noteTitle}</p>
            <ul className="list-disc ps-5 space-y-1">
              {t.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>

          {token ? (
            <Link
              href={`/pickup/${token}?lang=${lang}`}
              className="block w-full text-center bg-white text-blue-900 font-semibold py-3 rounded-lg hover:bg-blue-100 transition"
            >
              {t.start}
            </Link>
          ) : (
            <p className="text-center text-sm text-white/80">{t.noLink}</p>
          )}
        </div>
      </div>
    </main>
  );
}
