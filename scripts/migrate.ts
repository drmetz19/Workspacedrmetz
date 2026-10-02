import { loadEnv } from './env'
import { migrate } from '../src/server/db/migrate'

loadEnv()
migrate(process.env.DATABASE_URL!, console.log)
  .then(() => console.log('migrations up to date'))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
