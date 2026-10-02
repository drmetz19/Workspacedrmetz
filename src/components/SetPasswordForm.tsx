export function SetPasswordForm({ token }: { token: string }) {
  return (
    <form action="/api/auth/password-token" method="post">
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label htmlFor="password">Password baru</label>
        <input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required />
        <div className="field-hint">Minimal 8 karakter.</div>
      </div>
      <div className="field">
        <label htmlFor="confirm">Ulangi password</label>
        <input id="confirm" name="confirm" type="password" minLength={8} autoComplete="new-password" required />
      </div>
      <button className="btn btn-primary btn-block" type="submit">Simpan password</button>
    </form>
  )
}
