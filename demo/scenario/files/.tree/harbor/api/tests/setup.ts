// config.ts validates the environment at import; tests never touch a real database.
process.env.DATABASE_URL ??= 'postgres://harbor:harbor@localhost:5432/harbor_test'
process.env.API_TOKENS ??= 'test-token'
process.env.LOG_LEVEL = 'error'
process.env.NODE_ENV = 'production'
