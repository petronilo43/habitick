import { Link } from 'react-router-dom'
import Logo from './Logo'
import SiteFooter from './SiteFooter'

// The frame for the simple pages (privacy, password reset, page not found):
// the logo linking home on top, the page in the middle, the footer below.
export default function PageShell({ children }) {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="max-w-7xl w-full mx-auto px-6 py-4 mt-2">
        <Link to="/" aria-label="Habitick home">
          <Logo />
        </Link>
      </header>
      <main className="flex-grow max-w-3xl w-full mx-auto px-6 py-10">{children}</main>
      <SiteFooter />
    </div>
  )
}
