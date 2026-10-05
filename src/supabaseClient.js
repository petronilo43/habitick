import { createClient } from '@supabase/supabase-js'

// The address of the Supabase project and its publishable key. Both are found in the
// Supabase dashboard, in the project's API settings, and both are meant to be public:
// what protects the data is the rules in supabase/schema.sql, not this key.
//
// Locally they are read from the file .env.local (see .env.example).
// On Vercel they are set under Settings > Environment Variables.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isConfigured = Boolean(url && key)

export const supabase = isConfigured ? createClient(url, key) : null
