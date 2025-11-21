// verify.js（邮箱点击验证链接后，检查 session 并自动登录）
const supabase = window.supabaseClient;
const msgEl = document.getElementById("msg");
const goHomeBtn = document.getElementById("goHomeBtn");
const goLoginBtn = document.getElementById("goLoginBtn");

function setMsg(text, color = "#6b7280") {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.style.color = color;
}

// 点击按钮：直接去首页 / 登录页（备用入口）
goHomeBtn.addEventListener("click", () => {
  window.location.href = "index.html";
});
goLoginBtn.addEventListener("click", () => {
  window.location.href = "login.html";
});

// 页面加载时尝试读取当前用户
(async () => {
  try {
    setMsg("正在确认你的邮箱并获取登录状态，请稍候...");

    // 关键点：Supabase 的确认链接在跳转时会把 session 放到 URL 片段里，
    // supabase-js 在 createClient 时会自动解析并保存 session。:contentReference[oaicite:1]{index=1}
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      console.error("getUser error:", error);
    }

    if (data && data.user) {
      // 说明已经有登录 session 了
      setMsg("邮箱验证成功，正在为你登录并跳转首页...", "#15803d");
      setTimeout(() => {
        window.location.href = "index.html";
      }, 1500);
    } else {
      // 没有拿到用户信息
      setMsg(
        "链接验证完成，但当前浏览器没有登录信息。你可以点击下方按钮进入首页或登录页面。",
        "red"
      );
    }
  } catch (err) {
    console.error(err);
    setMsg(
      "验证过程中出现错误。你可以先到登录页面，使用邮箱和密码登录试试。",
      "red"
    );
  }
})();
