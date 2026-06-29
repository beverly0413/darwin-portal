// login.js - sign in and password reset email flow.
(function () {
  const sb = window.supabaseClient;

  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginBtn = document.getElementById("loginBtn");
  const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
  const msgEl = document.getElementById("msg");

  const SITE_URL =
    window.location.protocol === "file:"
      ? "https://darwin-portal.vercel.app/"
      : window.location.href;
  const PASSWORD_RESET_URL = new URL("reset-password.html", SITE_URL).href;

  function setMsg(text, color = "#6b7280") {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.color = color;
  }

  function setLoginLoading(isLoading) {
    if (!loginBtn) return;
    loginBtn.disabled = isLoading;
    loginBtn.textContent = isLoading ? "登录中..." : "登录";
  }

  async function ensureNickname(user) {
    const { data: profile } = await sb
      .from("profiles")
      .select("nickname")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.nickname) return;

    const emailPrefix = (user.email || "user").split("@")[0];
    const nickname =
      "Darwin" + emailPrefix.slice(0, 6) + Math.floor(Math.random() * 1000);

    await sb.from("profiles").upsert({
      id: user.id,
      email: user.email,
      nickname,
    });
  }

  async function sendPasswordResetEmail() {
    if (!sb) {
      setMsg("登录模块没有成功加载，请刷新页面后重试。", "red");
      return;
    }

    const email = emailInput.value.trim();
    if (!email) {
      setMsg("请先输入注册邮箱，再发送密码重置邮件。", "red");
      emailInput.focus();
      return;
    }

    forgotPasswordBtn.disabled = true;
    setMsg("正在发送密码重置邮件，请稍等...");

    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: PASSWORD_RESET_URL,
    });

    forgotPasswordBtn.disabled = false;

    if (error) {
      console.error("Reset password error:", error);
      setMsg(`发送失败：${error.message}`, "red");
      return;
    }

    setMsg("如果这个邮箱已经注册，我们已发送密码重置邮件，请去邮箱查看。", "#15803d");
  }

  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", sendPasswordResetEmail);
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!sb) {
        setMsg("登录模块没有成功加载，请刷新页面后重试。", "red");
        return;
      }

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        setMsg("请先输入邮箱和密码。", "red");
        return;
      }

      if (password.length < 6) {
        setMsg("密码长度至少需要 6 位。", "red");
        return;
      }

      setMsg("正在登录，请稍等...");
      setLoginLoading(true);

      const { data, error } = await sb.auth.signInWithPassword({
        email,
        password,
      });

      setLoginLoading(false);

      if (error) {
        console.error("Login error:", error);
        const message = (error.message || "").toLowerCase();
        if (message.includes("email not confirmed")) {
          setMsg("这个邮箱还没有验证，请先打开验证邮件完成激活。", "red");
        } else {
          setMsg("邮箱或密码不正确。忘记密码可以点击上方发送重置邮件。", "red");
        }
        return;
      }

      await ensureNickname(data.user);

      setMsg("登录成功，正在跳转...", "#15803d");
      setTimeout(() => {
        window.location.href = "index.html";
      }, 700);
    });
  }
})();
