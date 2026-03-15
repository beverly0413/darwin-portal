import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://lhmvgvvqxunjllncyvke.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxobXZndnZxeHVuamxsbmN5dmtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MDg0MTksImV4cCI6MjA3OTE4NDQxOX0.V2QZi0Ijas1Gtu3P4paHxhmsNq8sRPjwU-b3S9o3mKw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);