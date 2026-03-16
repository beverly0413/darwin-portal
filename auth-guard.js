// auth-guard.js
(function () {
  const supabaseClient = window.supabaseClient;

  if (!supabaseClient) {
    console.error("supabaseClient 未初始化，请检查 supabase.js 是否先加载。");
    return;
  }

  async function checkAuth() {
    try {
      const {
        data: { session },
        error
      } = await supabaseClient.auth.getSession();

      if (error) {
        console.error("获取 session 失败：", error.message);
        return;
      }

      const currentPath = window.location.pathname.toLowerCase();

      // 不需要拦截的页面
      const publicPages = [
        "/login.html",
        "/register.html",
        "/index.html",
        "/",
      ];

      const isPublicPage = publicPages.some((page) =>
        currentPath.endsWith(page)
      );

      if (!session && !isPublicPage) {
        // 未登录，跳转到登录页
        window.location.href = "login.html";
        return;
      }

      console.log("Auth guard 检查完成");
    } catch (err) {
      console.error("auth-guard 执行出错：", err);
    }
  }

  checkAuth();
})();