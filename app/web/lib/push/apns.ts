// Raw APNs HTTP/2 provider client. No `node-apn`/`apn` dependency — that
// package is unmaintained; Node's built-in `http2` + `crypto` cover the whole
// protocol (HTTP/2 POST + ES256 provider JWT), so we sign and send directly.
// Mirrors the lazy-cached-client pattern used elsewhere (rateLimit.ts's
// Upstash client, r2.ts's S3Client): env vars read at call time, client/token
// cached at module scope, never a class exported as the public surface.
import http2 from 'node:http2'
import crypto from 'node:crypto'
import { logger } from '@/server/core/logger'

export interface PushPayload {
  title: string
  body?: string | null
  data?: Record<string, unknown>
}

interface ApnsConfig {
  keyId: string
  teamId: string
  privateKey: string
  bundleId: string
  host: string
}

let _cachedConfig: ApnsConfig | null | undefined
let _cachedToken: { jwt: string; issuedAt: number } | undefined

function loadConfig(): ApnsConfig | null {
  if (_cachedConfig !== undefined) return _cachedConfig

  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  const rawKey = process.env.APNS_PRIVATE_KEY
  const bundleId = process.env.APNS_BUNDLE_ID
  if (!keyId || !teamId || !rawKey || !bundleId) {
    _cachedConfig = null
    return null
  }

  const environment = process.env.APNS_ENVIRONMENT === 'production' ? 'production' : 'development'
  _cachedConfig = {
    keyId,
    teamId,
    // .env stores the .p8 PEM as a single line with literal "\n" escapes.
    privateKey: rawKey.replace(/\\n/g, '\n'),
    bundleId,
    host: environment === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com',
  }
  return _cachedConfig
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

// Provider JWT (RFC 7519, ES256). Apple invalidates tokens after 1 hour and
// rate-limits re-signing (recommends reuse, not a fresh token per request) —
// cache and reuse for up to 50 minutes.
function getProviderToken(config: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000)
  if (_cachedToken && now - _cachedToken.issuedAt < 50 * 60) {
    return _cachedToken.jwt
  }

  const header = base64url(JSON.stringify({ alg: 'ES256', kid: config.keyId }))
  const payload = base64url(JSON.stringify({ iss: config.teamId, iat: now }))
  const signingInput = `${header}.${payload}`
  const signature = crypto
    .createSign('SHA256')
    .update(signingInput)
    .sign({ key: config.privateKey, dsaEncoding: 'ieee-p1363' })
  const jwt = `${signingInput}.${base64url(signature)}`

  _cachedToken = { jwt, issuedAt: now }
  return jwt
}

// Sends one push to one device token. Best-effort — never throws; the caller
// (notifications.service.createNotification) must not fail the notification
// write just because a push happened to fail.
export async function sendPush(deviceToken: string, payload: PushPayload): Promise<'sent' | 'invalid' | 'error'> {
  const config = loadConfig()
  if (!config) return 'error' // APNs not configured (no keys set) — soft no-op

  const jwt = getProviderToken(config)
  const body = JSON.stringify({
    aps: { alert: { title: payload.title, body: payload.body ?? undefined }, sound: 'default' },
    ...(payload.data ?? {}),
  })

  return new Promise((resolve) => {
    let settled = false
    const finish = (result: 'sent' | 'invalid' | 'error') => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const client = http2.connect(`https://${config.host}`)
    client.on('error', (err) => {
      logger.error('APNs connection error', { error: String(err) })
      finish('error')
    })

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': config.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    })

    let status = 0
    let responseBody = ''
    req.setEncoding('utf8')
    req.on('response', (headers) => {
      status = Number(headers[':status'] ?? 0)
    })
    req.on('data', (chunk: string) => {
      responseBody += chunk
    })
    req.on('end', () => {
      client.close()
      if (status === 200) return finish('sent')

      let reason: string | undefined
      try {
        reason = (JSON.parse(responseBody) as { reason?: string }).reason
      } catch {
        // non-JSON body — leave reason undefined, fall through to generic error
      }
      if (status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered') {
        logger.warn('APNs device token invalid — will be pruned', { status, reason })
        return finish('invalid')
      }
      logger.error('APNs send failed', { status, reason, body: responseBody })
      finish('error')
    })
    req.on('error', (err) => {
      logger.error('APNs request error', { error: String(err) })
      client.close()
      finish('error')
    })

    req.write(body)
    req.end()
  })
}
