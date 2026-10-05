import { Link } from 'react-router-dom'
import PageShell from '../components/PageShell'

const heading = 'text-xl font-bold text-slate-900 mt-10 mb-3'
const list = 'list-disc pl-5 space-y-2 text-slate-700 leading-relaxed'

// What the site stores about people, who can see it, and how to remove it.
export default function Privacy() {
  return (
    <PageShell>
      <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Privacy and your data</h1>
      <p className="text-lg text-slate-600 mt-4 leading-relaxed">
        Habitick is a portfolio project by Thiago Petronilo, not a business. No real services are provided. This page says plainly what the site stores and who can see it.
      </p>

      <h2 className={heading}>What is stored</h2>
      <ul className={list}>
        <li><strong>Your account:</strong> your email address and a scrambled form of your password, kept by the login service, plus the name you typed.</li>
        <li><strong>Your bookings:</strong> the service and option, the date, your Eircode and any notes you wrote.</li>
        <li><strong>If you offer services:</strong> the services and areas you chose, the jobs you accepted and the reviews you received.</li>
        <li><strong>Reviews</strong> you write: the stars and the comment.</li>
        <li><strong>Payments:</strong> that a payment was made, for what and how much. Card details are typed on the payment company&apos;s page and never reach this site. All payments here are test payments: no money moves.</li>
      </ul>

      <h2 className={heading}>Who can see it</h2>
      <ul className={list}>
        <li>You see your own bookings. Nobody else does until a professional accepts one.</li>
        <li>Before accepting, professionals see the service, date, price, your notes and only the <strong>first three characters</strong> of your Eircode. A full Eircode points to one address, so it stays hidden.</li>
        <li>After a professional accepts, the two of you see each other&apos;s name, and the professional sees the full Eircode.</li>
        <li>A review is visible to the client who wrote it and the professional it is about. Other clients see only the professional&apos;s average.</li>
        <li>The site&apos;s owner can see the database, as with any website.</li>
      </ul>

      <h2 className={heading}>Where it is kept</h2>
      <p className="text-slate-700 leading-relaxed">
        The data is held by Supabase (database and login) on servers in the EU, and test payments are handled by Stripe. The site uses no advertising or tracking cookies; your browser only remembers that you are logged in.
      </p>

      <h2 className={heading}>The demo</h2>
      <p className="text-slate-700 leading-relaxed">
        The demo creates a guest session with made-up sample data that only you can see. It is deleted straight away if you end the demo in Settings. Demos older than 3 days are cleared out whenever someone starts a new one.
      </p>

      <h2 className={heading}>Deleting your data</h2>
      <p className="text-slate-700 leading-relaxed">
        You can delete your account at any time in <Link to="/dashboard" state={{ tab: 'settings' }} className="font-bold text-emerald-700 hover:underline">Settings</Link>. That removes your profile, the bookings you made, your reviews and your preferences. Jobs you had accepted go back on offer to other professionals. If you paid for something, the payment record is kept without your name.
      </p>

      <h2 className={heading}>Questions</h2>
      <p className="text-slate-700 leading-relaxed">
        Write to <a href="mailto:petronilothiago@gmail.com" className="font-bold text-emerald-700 hover:underline">petronilothiago@gmail.com</a>.
      </p>
    </PageShell>
  )
}
