(() => {
  const form = document.getElementById('authForm');
  const loginTab = document.getElementById('loginTab');
  const signupTab = document.getElementById('signupTab');
  const tabs = document.querySelector('.tabs');
  const usernameField = document.getElementById('usernameField');
  const usernameInput = form.elements.username;
  const emailField = document.getElementById('emailField');
  const emailInput = form.elements.email;
  const passwordField = document.getElementById('passwordField');
  const password = form.elements.password;
  const resetPasswordField = document.getElementById('resetPasswordField');
  const newPassword = form.elements.newPassword;
  const forgotPassword = document.getElementById('forgotPassword');
  const backToLogin = document.getElementById('backToLogin');
  const status = document.getElementById('status');
  const submit = document.getElementById('submitButton');
  let mode = 'login';
  const resetToken = new URLSearchParams(window.location.search).get('reset_token');

  if (localStorage.getItem('authToken') && !resetToken) window.location.replace('profile.html');

  function setMode(next) {
    mode = next;
    const login = mode === 'login';
    const signup = mode === 'signup';
    const requestReset = mode === 'forgot';
    const confirmReset = mode === 'reset';
    loginTab.classList.toggle('active', login);
    signupTab.classList.toggle('active', signup);
    loginTab.setAttribute('aria-selected', String(login));
    signupTab.setAttribute('aria-selected', String(signup));
    tabs.hidden = requestReset || confirmReset;
    usernameField.hidden = requestReset || confirmReset;
    usernameInput.required = login || signup;
    emailField.hidden = !(signup || requestReset);
    emailInput.required = signup || requestReset;
    emailInput.autocomplete = 'email';
    passwordField.hidden = requestReset || confirmReset;
    password.required = login || signup;
    password.autocomplete = signup ? 'new-password' : 'current-password';
    password.minLength = signup ? 8 : 1;
    resetPasswordField.hidden = !confirmReset;
    newPassword.required = confirmReset;
    document.getElementById('passwordHint').hidden = !signup && !confirmReset;
    forgotPassword.hidden = !login;
    backToLogin.hidden = !(requestReset || confirmReset);
    submit.disabled = requestReset;
    document.getElementById('formTitle').textContent = login ? 'Welcome back' : signup ? 'Create your account' : requestReset ? 'Reset your password' : 'Choose a new password';
    document.getElementById('formSubtitle').textContent = login ? 'Sign in to pick up where you left off.' : signup ? 'A few details and you’re ready to go.' : requestReset ? 'Enter the email address for your account and we’ll send a reset link.' : 'Choose a password with at least 8 characters.';
    document.querySelector('label[for="password"]').textContent = signup ? 'Password' : 'Password';
    submit.innerHTML = login ? 'Log in <span aria-hidden="true">→</span>' : signup ? 'Create account <span aria-hidden="true">→</span>' : requestReset ? 'Send reset link <span aria-hidden="true">→</span>' : 'Update password <span aria-hidden="true">→</span>';
    status.textContent = '';
    status.classList.remove('success');
  }

  forgotPassword.addEventListener('click', () => setMode('forgot'));
  backToLogin.addEventListener('click', () => {
    window.history.replaceState({}, '', window.location.pathname);
    setMode('login');
  });
  loginTab.addEventListener('click', () => setMode('login'));
  signupTab.addEventListener('click', () => setMode('signup'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = '';
    status.classList.remove('success');
    if (!form.reportValidity()) return;
    submit.disabled = true;
    try {
      if (mode === 'forgot') {
        status.textContent = 'Password reset is not available yet.';
        return;
      }
      if (mode === 'reset') {
        const response = await fetch('/api/v1/auth/reset-password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: resetToken, new_password: newPassword.value })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || 'Could not update your password.');
        window.history.replaceState({}, '', window.location.pathname);
        status.textContent = payload.message;
        status.classList.add('success');
        setMode('login');
        status.textContent = payload.message;
        status.classList.add('success');
        return;
      }
      if (mode === 'signup') {
        const response = await fetch('/api/v1/auth/signup', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: usernameInput.value.trim(), email: emailInput.value.trim(), password: password.value })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || 'Could not create your account.');
      }
      const body = new URLSearchParams({ username: usernameInput.value.trim(), password: password.value });
      const loginResponse = await fetch('/api/v1/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const token = await loginResponse.json();
      if (!loginResponse.ok) throw new Error(token.detail || 'Unable to sign in.');
      localStorage.setItem('authToken', token.access_token);
      window.location.assign('profile.html');
    } catch (error) {
      status.textContent = error.message || 'Could not connect to the server.';
      status.classList.remove('success');
    } finally {
      submit.disabled = false;
    }
  });

  setMode(resetToken ? 'reset' : 'login');
  if (!resetToken) forgotPassword.hidden = false;
})();
