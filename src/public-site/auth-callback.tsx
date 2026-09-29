import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

async function handleCallback() {
  try {
    // detectSessionInUrl: true will parse the hash fragment and establish the session.
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      window.location.replace('/public-site.html#portal');
      return;
    }

    // Detect the auth type from the original URL hash before Supabase consumed it.
    // Supabase stores the detected type in the URL temporarily; check for recovery.
    const hashStr = window.location.hash || '';
    const isRecovery = hashStr.includes('type=recovery');

    if (isRecovery) {
      // Password reset flow — user already has an account, just needs new password.
      // Route to portal with a recovery flag so the portal can show the reset form.
      window.location.replace('/public-site.html#portal?recover=1');
    } else {
      // Signup / OTP flow — the portal's route guard will check setup status
      // and send to Account Setup if needed.
      window.location.replace('/public-site.html#portal');
    }
  } catch {
    window.location.replace('/public-site.html#portal');
  }
}

handleCallback();
