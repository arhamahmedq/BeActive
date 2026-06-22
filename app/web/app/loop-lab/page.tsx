'use client'
import runsData from './runs.data.json'

// ponytail: data is a static JSON the loop:snapshot script appends to — no server/fs API
// (this Next version's server-component fs differs from stock; static import is the safe, lab-convention path).

type Basis = string
type Metric = { label: string; before: string; after: string; delta: string; basis: Basis }
type Score = { dim: string; before: number; after: number; basis: Basis; note?: string }
type Run = {
  id: string
  date: string
  title: string
  prompt: string
  commit?: string
  pr?: number
  loop: {
    rulesFired: string[]
    reviewersRouted: string[]
    gate: { passed: boolean; steps: { id: string; ok: boolean; ms: number; note?: string }[]; tests: number }
    findings: { critical: number; high: number; medium: number; low: number }
  }
  diff: { files: number; insertions: number; deletions: number }
  screens: { before: string | null; after: string | null; note?: string }
  metrics: Metric[]
  scores: Score[]
}

const runs = runsData as Run[]

const NO_CHANGE = new Set(['no change', '—', '', 'unchanged', 'none'])
function changed(m: Metric) {
  return !NO_CHANGE.has(m.delta.toLowerCase())
}
function deltaTone(delta: string): string {
  const d = delta.toLowerCase()
  if (NO_CHANGE.has(d)) return 'bg-gray-100 text-gray-400'
  if (d.includes('fail') || d.includes('regress') || d.includes('block')) return 'bg-red-500 text-white'
  return 'bg-brand-500 text-white'
}

/* ── one stage of the flow, hung off a numbered rail ── */
function Stage({ n, title, last, children }: { n: number; title: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center pt-0.5">
        <div className="w-8 h-8 shrink-0 rounded-full bg-gray-900 text-white grid place-items-center text-[13px] font-bold">{n}</div>
        {!last && <div className="w-px flex-1 bg-gray-200 mt-2" />}
      </div>
      <div className={`flex-1 min-w-0 ${last ? '' : 'pb-8'}`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-400 mb-2">{title}</p>
        {children}
      </div>
    </div>
  )
}

function GateTile({ id, ok, ms }: { id: string; ok: boolean; ms: number }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{id}</p>
      <p className="text-[14px] font-bold tabular-nums text-gray-900">
        <span className={ok ? 'text-brand-600' : 'text-red-600'}>{ok ? '✓' : '✗'}</span> {(ms / 1000).toFixed(1)}s
      </p>
    </div>
  )
}

function ScoreRow({ s }: { s: Score }) {
  const diff = +(s.after - s.before).toFixed(1)
  const tone = diff > 0 ? 'text-brand-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'
  return (
    <div className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-3 py-1.5">
      <span className="text-[12.5px] font-medium text-gray-700">{s.dim}</span>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-gray-300" style={{ width: `${(s.before / 10) * 100}%` }} /></div>
        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-brand-400" style={{ width: `${(s.after / 10) * 100}%` }} /></div>
      </div>
      <span className="text-[12.5px] font-bold tabular-nums text-right">
        <span className="text-gray-400">{s.before}</span><span className="text-gray-300">/</span><span className="text-gray-900">{s.after}</span>
        <span className={`block text-[10px] ${tone}`}>{diff > 0 ? '+' : ''}{diff}</span>
      </span>
    </div>
  )
}

function ScreenCell({ src, label }: { src: string | null; label: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${label} screenshot`} className="w-full rounded-lg border border-gray-200" />
      ) : (
        <div className="aspect-video rounded-lg border border-dashed border-gray-200 bg-gray-50 grid place-items-center text-[11px] text-gray-400">not captured</div>
      )}
    </div>
  )
}

function RunCard({ run }: { run: Run }) {
  const f = run.loop.findings
  const fixes = run.metrics.filter((m) => m.basis.startsWith('measured') && changed(m))
  const headline = fixes[0]
  const hasScreens = run.screens.before || run.screens.after
  return (
    <section className="rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* header + headline outcome */}
      <header className="px-6 pt-5 pb-5 border-b border-gray-100">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <h2 className="text-[16px] font-bold text-gray-900">{run.title}</h2>
          {run.pr && <a href={`https://github.com/arhamahmedq/BeActive/pull/${run.pr}`} className="text-[12px] font-semibold text-brand-600">#{run.pr}</a>}
          {run.commit && <code className="text-[11px] text-gray-400">{run.commit}</code>}
          <span className="ml-auto text-[11px] text-gray-400">{run.date}</span>
        </div>
        {headline ? (
          <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-red-50 to-brand-50 border border-gray-100 px-4 py-3">
            <span className="text-[12px] font-semibold text-gray-500 shrink-0">{headline.label}</span>
            <span className="ml-auto flex items-center gap-2.5 text-[14px] font-bold">
              <span className="text-red-500 line-through decoration-red-300">{headline.before}</span>
              <span className="text-gray-300">→</span>
              <span className="text-brand-600">{headline.after}</span>
            </span>
          </div>
        ) : (
          <p className="text-[13px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">Loop infrastructure produced no meaningful improvement.</p>
        )}
      </header>

      <div className="px-6 py-6">
        {/* ① INPUT */}
        <Stage n={1} title="Input · the prompt">
          <p className="text-[13px] text-gray-700 leading-relaxed rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3">{run.prompt}</p>
        </Stage>

        {/* ② LOOP */}
        <Stage n={2} title="Loop engine">
          <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-gray-400 mr-1">reviewers</span>
              {run.loop.reviewersRouted.map((r) => (
                <span key={r} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-900 text-white">{r}</span>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {run.loop.gate.steps.map((s) => <GateTile key={s.id} id={s.id} ok={s.ok} ms={s.ms} />)}
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className={`px-2.5 py-1 rounded-full ${run.loop.gate.passed ? 'bg-brand-100 text-brand-700' : 'bg-red-100 text-red-700'}`}>gate {run.loop.gate.passed ? 'PASS' : 'FAIL'}</span>
              <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{run.loop.gate.tests} tests</span>
              <span className={`px-2.5 py-1 rounded-full ${f.critical + f.high > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{f.critical} crit · {f.high} high · {f.medium} med · {f.low} low</span>
              <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">diff {run.diff.files}f +{run.diff.insertions}/−{run.diff.deletions}</span>
            </div>
            <details className="group">
              <summary className="text-[11px] font-medium text-gray-400 cursor-pointer hover:text-gray-600 list-none">what fired ▾</summary>
              <ul className="mt-2 space-y-1.5">
                {run.loop.rulesFired.map((rule, i) => (
                  <li key={i} className="text-[12px] text-gray-600 leading-snug flex gap-2"><span className="text-brand-500 font-bold shrink-0">›</span>{rule}</li>
                ))}
              </ul>
            </details>
          </div>
        </Stage>

        {/* ③ COMPARE — the two states, side by side */}
        <Stage n={3} title="Before vs After">
          <div className="rounded-2xl border border-gray-200 overflow-hidden">
            {hasScreens && (
              <div className="grid grid-cols-2 gap-3 p-3 border-b border-gray-100 bg-gray-50/50">
                <ScreenCell src={run.screens.before} label="Before" />
                <ScreenCell src={run.screens.after} label="After" />
              </div>
            )}
            {/* column header */}
            <div className="grid grid-cols-[1.1fr_1.3fr_1.3fr] gap-3 px-4 py-2 bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              <span>Metric</span><span className="text-red-500">Before</span><span className="text-brand-600">After</span>
            </div>
            {run.metrics.map((m, i) => (
              <div key={i} className="grid grid-cols-[1.1fr_1.3fr_1.3fr] gap-3 px-4 py-2.5 border-t border-gray-100 items-center">
                <span className="text-[12.5px] font-semibold text-gray-800">{m.label}</span>
                <span className="text-[12px] text-gray-500">{m.before}</span>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-[12px] text-gray-900 font-medium truncate">{m.after}</span>
                  <span className={`shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${deltaTone(m.delta)}`}>{m.delta}</span>
                </span>
              </div>
            ))}
            {!hasScreens && run.screens.note && (
              <p className="text-[11px] text-gray-400 px-4 py-2 border-t border-gray-100 bg-gray-50/50 leading-snug">📷 {run.screens.note}</p>
            )}
          </div>
        </Stage>

        {/* ④ DELTA scorecard */}
        <Stage n={4} title="Delta scorecard" last>
          <div className="rounded-2xl border border-gray-100 p-4">
            <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mb-3 leading-snug">
              X/10 scores are <b>LLM assessment</b> grounded in the cited findings — not instrument readings. The objective proof is the comparison table above.
            </p>
            <div className="grid grid-cols-[7rem_1fr_3.5rem] gap-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 pb-1 border-b border-gray-100">
              <span>Dimension</span><span className="text-center">Before · After</span><span className="text-right">/10</span>
            </div>
            {run.scores.map((s) => <ScoreRow key={s.dim} s={s} />)}
          </div>
        </Stage>
      </div>
    </section>
  )
}

export default function LoopLabPage() {
  return (
    <div className="min-h-screen bg-app">
      <header className="sticky top-0 z-30 glass-nav">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-3">
          <span className="text-brand-500 font-black text-lg">▶</span>
          <h1 className="font-bold text-[15px] text-gray-900">Loop Lab</h1>
          <span className="text-[11px] text-gray-400 font-medium">before → loop → after, per run</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <p className="text-[12px] text-gray-500 leading-relaxed">
          Each run reads top-down through a numbered flow — <b>Input → Loop engine → Before vs After → Delta</b> — built from real{' '}
          <code className="text-gray-700">.quality/</code> + git data. Append one with <code className="text-gray-700">npm run loop:snapshot</code>.
        </p>

        {runs.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
            <p className="text-[14px] font-semibold text-gray-700">No loop runs captured yet.</p>
            <p className="text-[12px] text-gray-400 mt-1">Run <code>npm run loop:snapshot -- &quot;task title&quot;</code> after a task.</p>
          </div>
        ) : (
          runs.map((r) => <RunCard key={r.id} run={r} />)
        )}
      </div>
    </div>
  )
}
