// Shown instead of the app when the two Supabase settings are missing, so a missing
// setting produces an explanation rather than a blank page.
export default function SetupNeeded() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans text-slate-800">
      <div className="max-w-lg bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
        <div className="text-2xl font-black text-slate-900 tracking-tight mb-4">
          Habi<span className="text-emerald-600">tick.ie</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">The site is not connected to its database yet</h1>
        <p className="text-slate-600 leading-relaxed mb-4">
          Two settings are missing: <code className="font-mono text-sm">VITE_SUPABASE_URL</code> and{' '}
          <code className="font-mono text-sm">VITE_SUPABASE_PUBLISHABLE_KEY</code>.
        </p>
        <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
          <li>
            On your computer: copy <code className="font-mono">.env.example</code> to <code className="font-mono">.env.local</code>, fill in
            the two values and restart <code className="font-mono">npm run dev</code>.
          </li>
          <li>On Vercel: add them under Settings, Environment Variables, then redeploy.</li>
        </ul>
      </div>
    </div>
  )
}
