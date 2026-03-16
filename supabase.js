(function () {
  const SUPABASE_URL = "https://lhmvgvvqxunjllncyvke.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBiYXNlIiwicmVmIjoibGhtdmd2dnF4dW5qbGxuY3l2a2UiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc2MzYwODQxOSwiZXhwIjoyMDc5MTg0NDE5fQ.V2QZi0Ijas1Gtu3P4paHxhmsNq8sRPjwU-b3S9o3mKw";

  function initSupabaseClient() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      console.error(
        "Supabase CDN 未加载。请先在 HTML 中引入：https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
      );
      return null;
    }

    if (!window.supabaseClient) {
      window.supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
      );
      console.log("supabaseClient 初始化成功");
    }

    return window.supabaseClient;
  }

  initSupabaseClient();
  window.getSupabaseClient = initSupabaseClient;
})();