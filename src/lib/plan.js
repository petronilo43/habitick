// The Pro plan, as one person stands in it.
//
// `plan` holds the plan's numbers and comes from the database (the pro_plan()
// function in supabase/schema.sql), so the website can never promise something
// different from what the database enforces.

const DAY = 24 * 60 * 60 * 1000

export class Membership {
  constructor(profile, plan, now = new Date()) {
    this.plan = plan
    this.now = now
    this.until = profile?.pro_until ? new Date(profile.pro_until) : null
    this.trialUsed = Boolean(profile?.trial_used)
  }

  get isMember() {
    return this.until !== null && this.until > this.now
  }

  // Whole days of membership left, counting a started day as a day.
  get daysLeft() {
    return this.isMember ? Math.ceil((this.until - this.now) / DAY) : 0
  }

  get canStartTrial() {
    return !this.isMember && !this.trialUsed
  }

  // How many accepted jobs this person may hold at once.
  get activeJobLimit() {
    return this.isMember ? this.plan.member_active_jobs : this.plan.free_active_jobs
  }

  // The benefits, as sentences, built from the plan's own numbers.
  get benefits() {
    const { early_access_minutes: minutes, member_active_jobs: more, free_active_jobs: fewer } = this.plan
    return [
      `See new requests ${minutes} minutes before everyone else`,
      `Hold up to ${more} jobs at once instead of ${fewer}`,
      'A PRO badge next to your name when you accept a booking',
    ]
  }
}
