import type { Request, Response, NextFunction } from 'express'

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

function clientKey(req: Request, suffix: string) {
  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
      : '') ||
    req.socket.remoteAddress ||
    'unknown'
  return `${ip}:${suffix}`
}

/** Simple sliding-window style limiter: max hits per windowMs. */
export function rateLimit(options: {
  windowMs: number
  max: number
  key?: string
  message?: string
}) {
  const { windowMs, max, key = 'default', message = '请求过于频繁，请稍后再试' } = options

  return (req: Request, res: Response, next: NextFunction) => {
    const id = clientKey(req, key)
    const now = Date.now()
    let bucket = buckets.get(id)
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(id, bucket)
    }
    bucket.count += 1
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)))
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(retryAfter))
      res.status(429).json({ error: message })
      return
    }
    next()
  }
}

// Opportunistic cleanup to avoid unbounded growth
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of buckets) {
    if (now >= v.resetAt) buckets.delete(k)
  }
}, 60_000).unref?.()
