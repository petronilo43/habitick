import { useState } from 'react'
import { reviewBooking } from '../lib/api'
import { MAX_COMMENT_LENGTH, validateReview } from '../lib/booking'
import Modal from './Modal'
import { errorBox, input, label, primary } from './ui'

const WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent']

// The client rates a finished job: 1 to 5 stars and, if they like, a few words.
// `onDone` is called once the review is saved.
export default function ReviewModal({ booking, onClose, onDone }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    const problem = validateReview({ rating, comment })
    if (problem) return setError(problem)

    setError('')
    setSaving(true)
    try {
      await reviewBooking(booking.id, { rating, comment })
      onDone()
    } catch (failure) {
      setError(failure.message)
      setSaving(false)
    }
  }

  return (
    <Modal label={`Review ${booking.proName}`} onClose={onClose} size="sm">
      <h3 className="text-xl font-bold text-slate-900 mb-1 pr-8">How did {booking.proName} do?</h3>
      <p className="text-sm text-slate-600 mb-5">
        {booking.serviceName}, {booking.option}
      </p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Real radio buttons drawn as stars, so the arrow keys and screen readers work. */}
        <fieldset>
          <legend className={label}>Your rating</legend>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((stars) => (
              <label key={stars} className="cursor-pointer">
                <input
                  type="radio"
                  name="rating"
                  value={stars}
                  checked={rating === stars}
                  onChange={() => setRating(stars)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`block text-4xl leading-none rounded-lg px-0.5 transition peer-focus-visible:outline-2 peer-focus-visible:outline-emerald-500 ${stars <= rating ? 'text-amber-500' : 'text-slate-200 hover:text-amber-200'}`}
                >
                  ★
                </span>
                <span className="sr-only">
                  {stars} {stars === 1 ? 'star' : 'stars'}
                </span>
              </label>
            ))}
            <span className="ml-3 text-sm font-semibold text-slate-600" aria-hidden="true">{WORDS[rating]}</span>
          </div>
        </fieldset>

        <div>
          <label className={label} htmlFor="review-comment">A few words (optional)</label>
          <textarea
            id="review-comment"
            value={comment}
            maxLength={MAX_COMMENT_LENGTH}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What went well? Anything to improve?"
            className={`${input} text-sm h-24 resize-none`}
          />
          <p className="text-xs text-slate-500 mt-1.5">{booking.proName} will see this. Other clients only see the average of the stars.</p>
        </div>

        {error && <p role="alert" className={errorBox}>{error}</p>}

        <button type="submit" disabled={saving} className={primary}>
          {saving ? 'Saving…' : 'Send review'}
        </button>
      </form>
    </Modal>
  )
}
