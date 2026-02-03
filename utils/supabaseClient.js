import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vnnqjmsshzbmq.supabase.co';       // <-- replace this!
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubnFqbXNzaHpibW5nbmx5dnpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMzE2ODksImV4cCI6MjA2NjgwNzY4OX0.ATv6RVLhr5Oi3lJ74fMe4WJrUdm-d2gjuID7VDGtAec';                  // <-- replace this!

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
