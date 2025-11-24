// auth-guard.js
// 统一的“必须登录”检查

const supabase = window.supabaseClient || null;

/**
 * requireLogin:
 * - 成功：返回当前用户对象 user
 * - 未登录：弹窗并跳转到 login.html，然后抛出异常终止后续逻辑
 */
async function requireLogin() {
  if (!supabase) {
    alert("登录模块加载失败，请稍后刷新重试。");
    throw new Error("Supabase not initialized");
  }

  const { data, error } = await supabase.auth.getUser();

  if (error || !data || !data.user) {
    alert("请先登录后再使用发帖功能。");
    window.location.href = "login.html";
    throw new Error("Not logged in");
  }

  return data.user; // 已登录用户
}
