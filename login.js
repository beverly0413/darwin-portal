// login.js（只负责“已有账号登录”，不自动注册）
const supabase = window.supabaseClient;

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const msgEl = document.getElementById("msg");

// 显示提示文字
function setMsg(text, color = "#6b7280") {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.style.color = color;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    setMsg("请先输入邮箱和密码。", "red");
    return;
  }

  if (password.length < 6) {
    setMsg("密码长度至少需要 6 位。", "red");
    return;
  }

  setMsg("正在登录，请稍候...");

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Login error:", error);

    const msg = (error.message || "").toLowerCase();
    // 针对常见几种情况给一点更清楚的提示
    if (msg.includes("email not confirmed")) {
      setMsg("登录失败：邮箱还没有验证，请先去邮箱点击验证链接。", "red");
    } else {
      setMsg("登录失败：邮箱或密码错误，或账号未激活。", "red");
    }
    return;
  }

  // 登录成功
  setMsg("登录成功，正在跳转...", "#15803d");
  setTimeout(() => {
    window.location.href = "index.html";
  }, 800);
});
