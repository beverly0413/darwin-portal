// supabase.js
(function () {
  const SUPABASE_URL = "https://lhmvgvvqxunjllncyvke.supabase.co";
  const SUPABASE_ANON_KEY =
    "你的 anon key";

  if (!window.supabase || !window.supabase.createClient) {
    console.error("Supabase CDN 未正确加载，请先引入 supabase-js UMD 脚本。");
    return;
  }

  if (!window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );
    console.log("Supabase client 初始化成功");
  }
})();