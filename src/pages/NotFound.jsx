import { Link } from 'react-router-dom'
import PageShell from '../components/PageShell'

// Shown for any address the site does not have.
export default function NotFound() {
  return (
    <PageShell>
      <p className="text-sm font-bold text-emerald-700 uppercase tracking-wider">Error 404</p>
      <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mt-2">There is no page at this address</h1>
      <p className="text-lg text-slate-600 mt-4 max-w-xl">
        The link may be out of date, or the address may have a typo. The services and your bookings are still where they were.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/" className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-500 transition">
          See the services
        </Link>
        <Link to="/dashboard" className="bg-white text-slate-700 px-6 py-3 rounded-xl font-bold border border-slate-200 hover:bg-slate-50 transition">
          Go to my dashboard
        </Link>
      </div>
    </PageShell>
  )
}
