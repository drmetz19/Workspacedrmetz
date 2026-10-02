export function Flash({ msg, err, warn }: { msg?: string; err?: string; warn?: string }) {
  return (
    <>
      {msg && <div className="flash flash-ok" role="status">{msg}</div>}
      {err && <div className="flash flash-err" role="alert">{err}</div>}
      {warn && <div className="flash flash-warn" role="status">{warn}</div>}
    </>
  )
}
