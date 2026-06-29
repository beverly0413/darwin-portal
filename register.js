// register.js - create account, confirm password, and check a simple captcha.
const supabase = window.supabaseClient;

const form = document.getElementById("registerForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const captchaTextEl = document.getElementById("captchaText");
const captchaInputEl = document.getElementById("captchaInput");
const refreshCaptchaBtn = document.getElementById("refreshCaptchaBtn");
const registerBtn = document.getElementById("registerBtn");
const msgEl = document.getElementById("msg");

const EMAIL_REDIRECT_URL = new URL("verify.html", window.location.href).href;

let currentCaptcha = "";

function setMsg(text, color = "#6b7280") {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.style.color = color;
}

function setLoading(isLoading) {
  if (!registerBtn) return;
  registerBtn.disabled = isLoading;
  registerBtn.textContent = isLoading ? "注册中..." : "注册";
}

function generateCaptcha() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  currentCaptcha = code;
  if (captchaTextEl) {
    captchaTextEl.textContent = code;
  }
}

generateCaptcha();

if (refreshCaptchaBtn) {
  refreshCaptchaBtn.addEventListener("click", () => {
    generateCaptcha();
  });
}

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!supabase) {
      setMsg("注册模块没有成功加载，请刷新页面后重试。", "red");
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
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

    setMsg("正在创建账户并发送验证邮件，请稍等...");
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: EMAIL_REDIRECT_URL,
      },
    });

    setLoading(false);

    if (error) {
      console.error("Sign up error:", error);
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("already registered") || msg.includes("already exists")) {
        setMsg("该邮箱已经注册，请直接前往登录页面。", "red");
      } else {
        setMsg(`注册失败：${error.message}`, "red");
      }
      generateCaptcha();
      captchaInputEl.value = "";
      return;
    }

    setMsg(
      "注册成功！验证邮件已发送，请前往邮箱点击验证链接。验证成功后即可登录。",
      "#15803d"
    );
    form.reset();
    generateCaptcha();
  });
}
