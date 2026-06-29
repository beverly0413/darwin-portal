// register.js - create account, detect existing email, and send reset email.
(function () {
  const sb = window.supabaseClient;

  const form = document.getElementById("registerForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const captchaTextEl = document.getElementById("captchaText");
  const captchaInputEl = document.getElementById("captchaInput");
  const refreshCaptchaBtn = document.getElementById("refreshCaptchaBtn");
  const registerBtn = document.getElementById("registerBtn");
  const resetRegisteredEmailBtn = document.getElementById("resetRegisteredEmailBtn");
  const msgEl = document.getElementById("msg");

  const SITE_URL =
    window.location.protocol === "file:"
      ? "https://darwin-portal.vercel.app/"
      : window.location.href;
  const EMAIL_REDIRECT_URL = new URL("verify.html", SITE_URL).href;
  const PASSWORD_RESET_URL = new URL("reset-password.html", SITE_URL).href;

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

  function showResetButton(show) {
    if (!resetRegisteredEmailBtn) return;
    resetRegisteredEmailBtn.style.display = show ? "block" : "none";
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

  function isExistingEmailResult(data, error) {
    const message = (error?.message || "").toLowerCase();
    if (message.includes("already registered") || message.includes("already exists")) {
      return true;
    }
    return Array.isArray(data?.user?.identities) && data.user.identities.length === 0;
  }

  async function sendPasswordResetEmail() {
    if (!sb) {
      setMsg("注册模块没有成功加载，请刷新页面后重试。", "red");
      return;
    }

    const email = emailInput.value.trim();
    if (!email) {
      setMsg("请先输入注册邮箱。", "red");
      emailInput.focus();
      return;
    }

    resetRegisteredEmailBtn.disabled = true;
    setMsg("正在发送密码重置邮件，请稍等...");

    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: PASSWORD_RESET_URL,
    });

    resetRegisteredEmailBtn.disabled = false;

    if (error) {
      console.error("Reset password error:", error);
      setMsg(`发送失败：${error.message}`, "red");
      return;
    }

    setMsg("密码重置邮件已发送，请前往邮箱查看。", "#15803d");
  }

  generateCaptcha();

  if (refreshCaptchaBtn) {
    refreshCaptchaBtn.addEventListener("click", generateCaptcha);
  }

  if (resetRegisteredEmailBtn) {
    resetRegisteredEmailBtn.addEventListener("click", sendPasswordResetEmail);
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showResetButton(false);

      if (!sb) {
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

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: EMAIL_REDIRECT_URL,
        },
      });

      setLoading(false);

      if (isExistingEmailResult(data, error)) {
        setMsg("这个邮箱已经注册过了。你可以直接登录，或发送密码重置邮件。", "red");
        showResetButton(true);
        generateCaptcha();
        captchaInputEl.value = "";
        return;
      }

      if (error) {
        console.error("Sign up error:", error);
        setMsg(`注册失败：${error.message}`, "red");
        generateCaptcha();
        captchaInputEl.value = "";
        return;
      }

      setMsg("注册成功！验证邮件已发送，请前往邮箱点击验证链接。", "#15803d");
      form.reset();
      generateCaptcha();
    });
  }
})();
