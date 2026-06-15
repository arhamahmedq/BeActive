// ---------------------------------------------------------------------------
// DESIGN LAB — POST HEADER  (DEV/DESIGN ONLY — safe to delete)
//
// v3: Concept A chosen and REFINED.
//   • Username leads a clean Instagram-style top bar: avatar · username · time.
//   • The activity subline under the username is GONE (it felt cramped).
//   • The verified tick is GONE — verification is reserved as an exclusive
//     signal for content creators in a future release.
//   • Activity context moves to a subtle neutral chip beside the streak so the
//     identity bar stays calm (can be dropped for a pure-Instagram look).
//
// Shown as a before / after vs the current production card. Production
// components (FeedCard, ProfilePostCard, p/[postId]) are untouched.
//
// Route:  /post-header-prototypes
// ---------------------------------------------------------------------------

import type { ReactNode } from 'react'

export const metadata = { title: 'Post Header — BeActive Design Lab' }

// ── Realistic sample post ──────────────────────────────────────────────────
const POST = {
  username: 'arhamfit',
  workoutLabel: 'Sports',
  workoutEmoji: '⚽',
  time: '2h',
  streak: 12,
  plantEmoji: '🌿',
  plantName: 'Sprout',
  imageUrl: '/rugby.jpeg',
  caption: 'Sunday league derby — 90 minutes, no subs. Left everything on the pitch.',
  likes: 24,
  comments: 5,
}

// ── Tiny self-contained primitives (no app hooks / providers needed) ───────

function Avatar({ size = 40 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {POST.username[0]?.toUpperCase()}
    </span>
  )
}

// BeActive mark — green rounded square + white play triangle + brand glow.
function BeActiveMark({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[4px] bg-brand-500"
      style={{ width: size, height: size, boxShadow: '0 0 9px rgba(34,197,94,0.45)' }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="white">
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  )
}

function MenuDots() {
  return (
    <span className="-mr-1.5 p-1.5 text-gray-400" aria-hidden>
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
        <circle cx="5" cy="12" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="19" cy="12" r="1.5" />
      </svg>
    </span>
  )
}

// ── Streak masthead — big number + subtle activity & evolution chips ─────────
function StreakMasthead({ withActivity = true }: { withActivity?: boolean }) {
  return (
    <div className="px-4 pb-3 pt-1">
      <div className="flex items-end gap-3">
        <span className="text-[52px] font-black leading-[0.78] tracking-tight tabular-nums text-black sm:text-[56px]">{POST.streak}</span>
        <span className="mb-1.5 text-[10px] font-bold uppercase leading-tight tracking-widest text-gray-500">Day<br />streak</span>
        <span className="mb-1.5 ml-auto flex items-center gap-1.5">
          {withActivity && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-600">
              <span className="text-[11px] leading-none" aria-hidden>{POST.workoutEmoji}</span> {POST.workoutLabel}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-700">
            {POST.plantEmoji} {POST.plantName}
          </span>
        </span>
      </div>
    </div>
  )
}

// ── Shared body — photo + caption + engagement (identical everywhere) ───────
function CardBody() {
  return (
    <>
      {/* Photo — full image, never cropped; blurred copy fills letterbox */}
      <div className="px-3 pb-3">
        <div className="relative flex items-center justify-center overflow-hidden rounded-[6px] bg-gray-100" style={{ minHeight: 220, maxHeight: 380 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={POST.imageUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={POST.imageUrl} alt="workout" className="relative z-[1] h-auto max-h-[380px] w-auto max-w-full object-contain" />
        </div>
      </div>

      {/* Caption — pull quote */}
      <div className="px-4 pb-1">
        <p className="border-t border-gray-200 pt-3 text-[13px] italic leading-relaxed text-gray-700">“{POST.caption}”</p>
      </div>

      {/* Engagement footer (Instagram-style action row: like · comment · share … save) */}
      <div className="flex items-center gap-5 px-4 py-3 text-gray-500">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z" /></svg>
          {POST.likes}
        </span>
        <span className="flex items-center gap-1.5 text-[13px] font-semibold" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 01-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1121 11.5z" /></svg>
          {POST.comments}
        </span>
        <span aria-hidden>
          <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13" /></svg>
        </span>
        <span className="ml-auto" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
        </span>
      </div>
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
//  REFINED A — clean identity-first top bar
//  avatar · username · time · ⋯   (no subline, no verified tick)
// ───────────────────────────────────────────────────────────────────────────
function RefinedACard() {
  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-[#faf9f6] transition-all duration-200 ease-out hover:-translate-y-[2px] hover:shadow-[0_8px_32px_rgba(0,0,0,0.10),0_2px_8px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2.5 px-3.5 pb-2.5 pt-3">
        <Avatar size={40} />
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold leading-tight text-gray-900">{POST.username}</span>
          <span className="text-gray-300" aria-hidden>·</span>
          <span className="text-[12px] font-medium text-gray-400">{POST.time}</span>
        </span>
        <MenuDots />
      </div>
      <StreakMasthead />
      <CardBody />
    </article>
  )
}

// ───────────────────────────────────────────────────────────────────────────
//  BASELINE — current production card (username buried in the masthead)
// ───────────────────────────────────────────────────────────────────────────
function BaselineCard() {
  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-[#faf9f6]">
      <div className="flex items-center gap-2 border-b-2 border-black px-4 pb-2 pt-3.5">
        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-black">{POST.workoutLabel} · Daily Proof</span>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-gray-400">{POST.time} ago</span>
        <MenuDots />
      </div>
      <div className="px-4 pb-3 pt-3">
        <div className="flex items-end gap-3">
          <span className="text-[52px] font-black leading-[0.78] tracking-tight tabular-nums text-black sm:text-[56px]">{POST.streak}</span>
          <span className="mb-1.5 text-[10px] font-bold uppercase leading-tight tracking-widest text-gray-500">Day<br />streak</span>
          <span className="mb-0.5 ml-auto flex items-center gap-2">
            <Avatar size={36} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold leading-tight text-gray-900">@{POST.username}</span>
              <span className="mt-0.5 block text-[10px] font-bold uppercase leading-tight tracking-wide text-brand-700">{POST.plantEmoji} {POST.plantName}</span>
            </span>
          </span>
        </div>
      </div>
      <CardBody />
    </article>
  )
}

// ── Small labelled column wrapper ───────────────────────────────────────────
function Labelled({ tag, title, blurb, children }: { tag: string; title: string; blurb: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <div className="mb-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-extrabold tracking-tight text-gray-900">{title}</h2>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">{tag}</span>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-gray-500">{blurb}</p>
      </div>
      <div className="w-full max-w-[440px]">{children}</div>
    </section>
  )
}

export default function PostHeaderPage() {
  return (
    <main className="min-h-dvh bg-[#f4f3ee] px-5 py-12 sm:px-8">
      <div className="mx-auto max-w-[960px]">
        {/* Page header */}
        <header className="mb-9 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-700">
            <BeActiveMark size={14} /> Design Lab · Concept A refined
          </span>
          <h1 className="mt-4 text-[32px] font-black leading-tight tracking-tight text-gray-900 sm:text-[40px]">
            Clean identity header
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
            The username leads a calm, Instagram-style top bar — <span className="font-semibold text-gray-800">avatar · username · time</span>.
            No subline, no verified tick. Verification is reserved as an exclusive signal for content creators down the line.
          </p>
        </header>

        {/* What changed */}
        <ul className="mb-10 space-y-2">
          {[
            'Removed the activity subline under the username — the top bar no longer feels cramped.',
            'Removed the verified tick — kept exclusive for future content-creator verification.',
            'Activity moved to a subtle neutral chip beside the streak so the “what workout” context isn’t lost (easy to drop for a pure-Instagram look).',
          ].map((t) => (
            <li key={t} className="flex gap-2.5 text-[13.5px] leading-relaxed text-gray-700">
              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
              {t}
            </li>
          ))}
        </ul>

        {/* Before / after */}
        <div className="grid grid-cols-1 gap-x-10 gap-y-12 md:grid-cols-2">
          <Labelled tag="What ships today" title="Before" blurb="Heavy black “{Activity} · Daily Proof” rule leads; the username is buried down in the masthead.">
            <BaselineCard />
          </Labelled>
          <Labelled tag="Recommended" title="After · Concept A (refined)" blurb="Username leads a clean top bar. Activity + evolution sit as quiet chips by the streak.">
            <RefinedACard />
          </Labelled>
        </div>
      </div>
    </main>
  )
}
