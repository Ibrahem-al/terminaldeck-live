import { z } from 'zod'

const Env = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(8787),
  API_TOKENS: z
    .string()
    .min(1, 'set at least one token in API_TOKENS')
    .transform((s) => s.split(',').map((t) => t.trim()).filter(Boolean)),
  STRIPE_KEY: z.string().startsWith('sk_').optional().or(z.literal('')),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info')
})

function load(): z.infer<typeof Env> {
  const parsed = Env.safeParse(process.env)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment:\n${problems}\n(see .env.example)`)
  }
  return parsed.data
}

const env = load()

export const config = {
  databaseUrl: env.DATABASE_URL,
  port: env.PORT,
  apiTokens: env.API_TOKENS,
  stripeKey: env.STRIPE_KEY || null,
  logLevel: env.LOG_LEVEL
} as const
