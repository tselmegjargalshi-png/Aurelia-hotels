import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useRouter, withQuery } from '../lib/router.js';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useSeo } from '../lib/seo.js';
import { Img } from '../components/Img.js';
import { Notice, TextInput } from '../components/ui.js';
import { isEmail, passwordProblem } from '../../../shared/validation.js';

/** Only allow same-site relative redirects after sign-in (no open redirects). */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/account/bookings';
}

function AuthShell({ title, intro, children, image = 'tyrol-infinity-pool-cabana' }: { title: string; intro: string; children: ReactNode; image?: string }) {
  return (
    <div className="auth">
      <div className="auth-media" aria-hidden="true"><Img src={image} alt="" sizes="50vw" /></div>
      <div className="auth-panel">
        <h1>{title}</h1>
        <p className="lede">{intro}</p>
        {children}
      </div>
    </div>
  );
}

export function SignInPage() {
  useSeo({ title: 'Sign in', noindex: true });
  const { login } = useAuth();
  const { query, navigate } = useRouter();
  const next = safeNext(query.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Enter your email and password.'); return; }
    setBusy(true); setError('');
    try {
      const u = await login(email, password);
      navigate(query.get('next') ? next : u.role === 'admin' ? '/admin' : next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed.');
    } finally { setBusy(false); }
  };

  return (
    <AuthShell title="Welcome back" intro="Sign in to manage your reservations and saved hotels.">
      {query.get('reason') === 'favorite' && <Notice tone="info">Sign in to save hotels to your account.</Notice>}
      <form onSubmit={submit} noValidate className="auth-form">
        <TextInput label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextInput label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Notice tone="bad" role="alert">{error}</Notice>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="auth-links"><Link to="/forgot-password">Forgot your password?</Link> · <Link to={withQuery('/register', { next: query.get('next') })}>Create an account</Link></p>
      <div className="demo-credentials">
        <strong>Demo accounts</strong>
        <span>Guest: <code>guest@aurelia.demo</code> / <code>Aurelia-Guest-2026</code></span>
        <span>Admin: <code>admin@aurelia.demo</code> / <code>Aurelia-Admin-2026</code></span>
        <small>Demonstration credentials for local use only — change them via environment variables before any deployment.</small>
      </div>
    </AuthShell>
  );
}

export function RegisterPage() {
  useSeo({ title: 'Create an account', noindex: true });
  const { register } = useAuth();
  const { query, navigate } = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = 'Please enter your name.';
    if (!isEmail(form.email)) errs.email = 'Enter a valid email address.';
    const p = passwordProblem(form.password); if (p) errs.password = p;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await register(form.name, form.email, form.password);
      navigate(safeNext(query.get('next')));
    } catch (err) {
      if (err instanceof ApiError) setErrors({ ...err.fields, _: err.message });
    } finally { setBusy(false); }
  };

  return (
    <AuthShell title="Create your account" intro="Keep your reservations in one place and save hotels for later." image="room-valley-view-king">
      <form onSubmit={submit} noValidate className="auth-form">
        <TextInput label="Full name" autoComplete="name" value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextInput label="Email" type="email" autoComplete="email" value={form.email} error={errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <TextInput label="Password" type="password" autoComplete="new-password" value={form.password} error={errors.password} hint="At least 10 characters, with a letter and a number." onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {errors._ && <Notice tone="bad" role="alert">{errors._}</Notice>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        <p className="field-hint">Passwords are stored as salted scrypt hashes. This is a demonstration service — don’t reuse a real password.</p>
      </form>
      <p className="auth-links">Already have an account? <Link to={withQuery('/sign-in', { next: query.get('next') })}>Sign in</Link></p>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  useSeo({ title: 'Reset your password', noindex: true });
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ message: string; demoResetUrl?: string | null; demoNotice?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isEmail(email)) { setError('Enter a valid email address.'); return; }
    setBusy(true); setError('');
    try { setResult(await api.post('/api/auth/forgot-password', { email })); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <AuthShell title="Reset your password" intro="Enter your account email and we’ll issue a reset link.">
      {result ? (
        <div role="status">
          <Notice tone="ok">{result.message}</Notice>
          {result.demoNotice && (
            <Notice tone="warn" title="Demo mode">
              {result.demoNotice}{' '}
              {result.demoResetUrl ? <Link to={result.demoResetUrl}>Open reset link</Link> : 'No account matched, so no link was issued.'}
            </Notice>
          )}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="auth-form">
          <TextInput label="Email" type="email" autoComplete="email" value={email} error={error} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
      <p className="auth-links"><Link to="/sign-in">Back to sign in</Link></p>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  useSeo({ title: 'Choose a new password', noindex: true });
  const { query } = useRouter();
  const token = query.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const p = passwordProblem(password);
    if (p) { setError(p); return; }
    setBusy(true); setError('');
    try { await api.post('/api/auth/reset-password', { token, password }); setDone(true); }
    catch (err) { setError(err instanceof ApiError ? (err.fields.password ?? err.message) : 'Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <AuthShell title="Choose a new password" intro="Your new password signs you out of other devices.">
      {!token ? <Notice tone="bad">This reset link is missing its token. <Link to="/forgot-password">Request a new link</Link>.</Notice>
        : done ? <Notice tone="ok" role="status" title="Password updated">You can now <Link to="/sign-in">sign in</Link> with your new password.</Notice> : (
          <form onSubmit={submit} noValidate className="auth-form">
            <TextInput label="New password" type="password" autoComplete="new-password" value={password} error={error} hint="At least 10 characters, with a letter and a number." onChange={(e) => setPassword(e.target.value)} />
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
          </form>
        )}
    </AuthShell>
  );
}
