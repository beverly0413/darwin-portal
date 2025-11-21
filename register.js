// register.js（创建新账户 + 两次密码校验 + 简单验证码）
const supabase = window.supabaseClient;

const form = document.getElementById("registerForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const captchaTextEl = document.getElementById("captchaText");
const captchaInputEl = document.getElementById("captchaInput");
const refreshCaptchaBtn = document.getElementById("refreshCaptchaBtn");
const msgEl = document.getElementById("msg");

// 验证邮件跳转到的网站页面（邮箱里点击验证后会打开这个页面）
const EMAIL_REDIRECT_URL = window.location.origin + "/verify.html";

let currentCaptcha = "";

// 显示提示文字
function setMsg(text, color = "#6b7280") {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.style.color = color;
}

// 生成简单验证码
function generateCaptcha() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  currentCaptcha = code;
  if (captchaTextEl) {
    captchaTextEl.textContent = code;
  }
}

generateCaptcha();

refreshCaptchaBtn.addEventListener("click", () => {
  generateCaptcha();
});

// 注册表单提交
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const confirmPassword = confirmPasswordInput.value.trim();
  const captchaInput = captchaInputEl.value.trim();

  if (!email || !password || !confirmPassword || !captchaInput) {
    setMsg("请完整填写所有信息。", "red");
    return;
  }

  if (password.length < 6) {
    setMsg("密码长度至少需要 6 位。", "red");
    return;
  }

  if (password !== confirmPassword) {
    setMsg("两次输入的密码不一致，请重新输入。", "red");
    return;
  }

  if (captchaInput.toUpperCase() !== currentCaptcha.toUpperCase()) {
    setMsg("验证码不正确，请重试。", "red");
    generateCaptcha();
    captchaInputEl.value = "";
    return;
  }

  setMsg("正在创建账户并发送验证邮件，请稍候...");

  // ★ 关键：这里指定 emailRedirectTo，让邮箱里的链接跳到 verify.html
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: EMAIL_REDIRECT_URL,
    },
  });

  if (error) {
    console.error("Sign up error:", error);
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("already registered") || msg.includes("already exists")) {
      setMsg("该邮箱已经注册，请直接前往登录页面。", "red");
    } else {
      setMsg("注册失败：" + error.message, "red");
    }
    return;
  }

  // 注册成功（但还没验证邮箱）
  setMsg(
    "注册成功！验证邮件已发送，请前往邮箱点击验证链接。验证成功后会自动登录。",
    "#15803d"
  );

  // 这里我们不立刻跳转，让用户自己去邮箱点击链接
});
