// supabase.js
const SUPABASE_URL = 'https://lhmvgvvqxunjllncyvke.supabase.co';  // 注意这里是两个 v

const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxobXZndnZxeHVuamxsbmN5dmtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MDg0MTksImV4cCI6MjA3OTE4NDQxOX0.V2QZi0Ijas1Gtu3P4paHxhmsNq8sRPjwU-b3S9o3mKw';

window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
