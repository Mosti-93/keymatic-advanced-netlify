import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://YOUR_PROJECT_ID.supabase.co';       // <-- replace this!
const supabaseAnonKey = 'YOUR_ANON_PUBLIC_KEY';                  // <-- replace this!

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
