import { useState } from 'react'
import { useApp } from '../context/app-context'
import { goToCheckout, paymentsEnabled, startProTrial } from '../lib/api'
import { formatDay, formatMoney } from '../lib/format'
import { Membership } from '../lib/plan'
import { smallGreen, smallQuiet } from './ui'

// The Pro plan: what it gives, where this person stands, and how to start it.
// `onChanged` is called with the fresh profile after the trial starts.
export default function PlanPanel({ profile, onChanged }) {
  const { plan, showToast } = useApp()
  const [busy, setBusy] = useState(false)

  if (!plan || !profile) return <p className="text-slate-500">Loading the plan…</p>

  const membership = new Membership(profile, plan)

  const handleTrial = async () => {
    setBusy(true)
    try {
      onChanged(await startProTrial())
      showToast(`Your ${plan.trial_days}-day Pro trial has started.`)
    } catch (problem) {
      showToast(problem.message, 'error')
    }
    setBusy(false)
  }

  const handleBuy = async () => {
    setBusy(true)
    showToast('Taking you to the payment page…')
    try {
      await goToCheckout({ kind: 'pro_plan' })
    } catch (problem) {
      showToast(problem.message, 'error')
    }
    setBusy(false)
  }

  return (
    <div className="max-w-2xl space-y-6 animate-in fade-in duration-300">
      <section className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute -right-6 -bottom-8 text-8xl opacity-10" aria-hidden="true">⭐</div>
        <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Habitick Pro</p>
        <h3 className="text-2xl sm:text-3xl font-black mt-1">
          {membership.isMember ? 'You are a Pro member' : 'You are on the free plan'}
        </h3>
        <p className="text-slate-300 mt-2">
          {membership.isMember
            ? `Until ${formatDay(membership.until)} (${membership.daysLeft} ${membership.daysLeft === 1 ? 'day' : 'days'} left).`
            : `Pro is ${formatMoney(plan.price_cents)} for ${plan.days} days. It does not renew by itself.`}
        </p>

        <ul className="mt-6 space-y-2 text-sm">
          {membership.benefits.map((benefit) => (
            <li key={benefit} className="flex gap-2">
              <span className="text-emerald-400" aria-hidden="true">✔</span> {benefit}
            </li>
          ))}
        </ul>

        <div className="mt-7 flex flex-wrap gap-3 relative z-10">
          {membership.canStartTrial && (
            <button onClick={handleTrial} disabled={busy} className={smallGreen}>
              Start my {plan.trial_days}-day free trial
            </button>
          )}
          {paymentsEnabled && (
            <button onClick={handleBuy} disabled={busy} className={membership.canStartTrial ? `${smallQuiet} bg-white` : smallGreen}>
              {membership.isMember ? `Add ${plan.days} days` : `Get ${plan.days} days`} for {formatMoney(plan.price_cents)}
            </button>
          )}
        </div>
      </section>

      <p className="text-sm text-slate-500 px-1">
        {paymentsEnabled
          ? 'Payments on this site run in test mode. On the payment page use the card 4242 4242 4242 4242 with any future date and any CVC. No real money moves.'
          : 'Buying the plan is not switched on for this copy of the site; the free trial shows what it does.'}
      </p>
    </div>
  )
}
