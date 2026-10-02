process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/csse_test'
process.env.IDENTITY_PROVIDER = 'local'
process.env.CSSE_ALLOW_DEV_IDP = '1'
process.env.APP_URL = 'http://localhost:3000'
