// js/supabase.js

(function () {
  const SUPABASE_URL = "https://你的项目ID.supabase.co";
  const SUPABASE_ANON_KEY = "你的anon key";

  // 防止重复初始化
  if (window.supabaseClient) {
    return;
  }

  // 检查 CDN 是否已加载
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase CDN not loaded. Please include the Supabase script before supabase.js");
    return;
  }

  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  console.log("Supabase client initialized successfully.");
})();