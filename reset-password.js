// reset-password.js - set a new password after a Supabase recovery email.
(function () {
  const sb = window.supabaseClient;

  const form = document.getElementById("resetPasswordForm");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const resetPasswordBtn = document.getElementById("resetPasswordBtn");
  const msgEl = document.getElementById("msg");

  function setMsg(text, color = "#6b7280") {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.color = color;
  }

  function setLoading(isLoading) {
    if (!resetPasswordBtn) return;
    resetPasswordBtn.disabled = isLoading;
    resetPasswordBtn.textContent = isLoading ? "保存中..." : "保存新密码";
  }

  async function loadRecoverySession() {
    if (!sb) {
      setMsg("密码重置模块没有成功加载，请刷新页面后重试。", "red");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (code) {
      const { error } = await sb.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("exchangeCodeForSession error:", error);
        setMsg("密码重置链接无效或已过期，请重新发送重置邮件。", "red");
      }
      return;
    }

    if (accessToken && refreshToken) {
      const { error } = await sb.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        console.error("setSession error:", error);
        setMsg("密码重置链接无效或已过期，请重新发送重置邮件。", "red");
      }
    }
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!sb) {
        setMsg("密码重置模块没有成功加载，请刷新页面后重试。", "red");
        return;
      }

      const password = passwordInput.value;
      const confirmPassword = confirmPasswordInput.value;

      if (!password || !confirmPassword) {
        setMsg("请输入两次新密码。", "red");
        return;
      }

      if (password.length < 6) {
        setMsg("新密码长度至少需要 6 位。", "red");
        return;
      }

      if (password !== confirmPassword) {
        setMsg("两次输入的新密码不一致。", "red");
        return;
      }

      setLoading(true);
      setMsg("正在保存新密码，请稍等...");

      const { error } = await sb.auth.updateUser({ password });

      setLoading(false);

      if (error) {
        console.error("updateUser error:", error);
        setMsg("保存失败：链接可能已过期，请重新发送密码重置邮件。", "red");
        return;
      }

      setMsg("密码已更新，正在前往登录页面...", "#15803d");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 900);
    });
  }

  loadRecoverySession();
})();
