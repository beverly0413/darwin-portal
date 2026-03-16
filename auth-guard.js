// auth-guard.js
(function () {
  const supabaseClient = window.supabaseClient;

  if (!supabaseClient) {
    console.error("supabaseClient 未初始化，请检查 supabase.js 是否先加载。");
    return;
  }

  async function isLoggedIn() {
    try {
      const {
        data: { session },
        error
      } = await supabaseClient.auth.getSession();

      if (error) {
        console.error("获取 session 失败：", error.message);
        return false;
      }

      return !!session;
    } catch (err) {
      console.error("检查登录状态出错：", err);
      return false;
    }
  }

  async function requireLogin(redirectUrl = "login.html") {
    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
      alert("请先登录后再发帖。");
      window.location.href = redirectUrl;
      return false;
    }
    return true;
  }

  window.authGuard = {
    isLoggedIn,
    requireLogin
  };
})();