import { resetSmokeDb, Smoke, startServer, stopServer, sql } from './smoke/lib'

/**
 * Smoke test end-to-end terhadap build produksi (`pnpm build` dulu).
 *   pnpm smoke        → semua fase (uji regresi)
 *   pnpm smoke 3      → fase tertentu
 */
const PHASES: Record<number, string> = {
  1: 'Login undangan',
  2: 'Admin organisasi',
  3: 'Registry manual + versi',
  4: 'Permission engine',
  5: 'Pencarian filter',
  6: 'Koneksi Drive + scan',
}

async function main() {
  const arg = process.argv[2]
  const phases = arg ? arg.split(',').map(Number) : Object.keys(PHASES).map(Number)
  const server = await startServer()
  const results: { phase: number; title: string; passed: boolean; checks: number; failed: number }[] = []
  try {
    for (const n of phases) {
      console.log(`\n▶ Phase ${n} — ${PHASES[n]}`)
      await resetSmokeDb()
      const t = new Smoke(String(n))
      const mod = await import(`./smoke/phase${n}.ts`)
      try {
        await mod.default(t)
      } catch (e) {
        t.check('Skenario selesai tanpa exception', false, String((e as Error).stack ?? e))
      }
      results.push({ phase: n, title: PHASES[n], passed: t.passed, checks: t.checks.length, failed: t.checks.filter((c) => !c.ok).length })
    }
  } finally {
    stopServer(server)
    await sql().end({ timeout: 2 })
  }
  console.log('\nRingkasan smoke test')
  for (const r of results) console.log(`  Phase ${r.phase} · ${r.title} · ${r.passed ? '✓' : '✗'} (${r.checks - r.failed}/${r.checks})`)
  if (results.some((r) => !r.passed)) {
    console.log('\nLog server (akhir):\n' + (server as unknown as { getLog: () => string }).getLog().slice(-3000))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
