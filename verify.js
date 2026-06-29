// verify.js - confirm Supabase email link and continue to the site.
const supabase = window.supabaseClient;
const msgEl = document.getElementById("msg");
const goHomeBtn = document.getElementById("goHomeBtn");
const goLoginBtn = document.getElementById("goLoginBtn");

function setMsg(text, color = "#6b7280") {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.style.color = color;
}

if (goHomeBtn) {
  goHomeBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });
}

if (goLoginBtn) {
  goLoginBtn.addEventListener("click", () => {
    window.location.href = "login.html";
  });
}

(async () => {
  if (!supabase) {
    setMsg("验证模块没有成功加载，请刷新页面后重试。", "red");
    return;
  }

  try {
    setMsg("正在确认你的邮箱，请稍等...");

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        console.error("exchangeCodeForSession error:", exchangeError);
      }
    }

    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) {
        console.error("setSession error:", sessionError);
      }
    }

    const { data, error } = await supabase.auth.getUser();

    if (error) {
      console.error("getUser error:", error);
    }

    if (data?.user) {
      setMsg("邮箱验证成功，正在跳转首页...", "#15803d");
      setTimeout(() => {
        window.location.href = "index.html";
      }, 1200);
      return;
    }

    setMsg("邮箱验证已完成。请点击下方按钮前往登录页面。", "#15803d");
  } catch (err) {
    console.error(err);
    setMsg("验证过程中出现错误。请前往登录页面，使用邮箱和密码登录。", "red");
  }
})();
