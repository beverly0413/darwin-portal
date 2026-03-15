// supabase.js
(function () {
  const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
  const SUPABASE_ANON_KEY = "YOUR_REAL_ANON_KEY";

  if (window.supabaseClient) return;

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase CDN not loaded. Please load it before supabase.js");
    return;
  }

  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  console.log("Supabase client initialized successfully.");
})();