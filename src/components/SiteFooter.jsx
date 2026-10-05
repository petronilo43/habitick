import { Link } from 'react-router-dom'
import Logo from './Logo'

export default function SiteFooter() {
  return (
    <footer className="bg-white border-t border-slate-100 mt-16 relative z-10">
      <div className="max-w-7xl mx-auto px-6 py-10 md:flex md:items-start md:justify-between gap-8">
        <div>
          <Logo className="text-xl" />
          <p className="text-sm text-slate-500 mt-2 max-w-xs">Everyday home services across Ireland, booked in a minute.</p>
        </div>
        <div className="mt-6 md:mt-0 md:text-right">
          <p className="text-sm text-slate-500 max-w-sm">
            A portfolio project by Thiago Petronilo. The services and prices are examples, and no real bookings are fulfilled.
          </p>
          <Link to="/privacy" className="inline-block mt-2 text-sm font-bold text-emerald-700 hover:underline">
            Privacy and your data
          </Link>
        </div>
      </div>
    </footer>
  )
}
