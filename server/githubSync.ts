import fs from 'fs'
import { dbPath, reopenDatabase } from './db.js'

type GhFile = {
  sha?: string
  content?: string
  encoding?: string
}

const repo = process.env.DATA_GITHUB_REPO || ''
const branch = process.env.DATA_GITHUB_BRANCH || 'data'
const token = process.env.GITHUB_TOKEN || process.env.DATA_GITHUB_TOKEN || ''
const remotePath = process.env.DATA_GITHUB_PATH || 'dictation.db'

function enabled() {
  return Boolean(repo && token)
}

async function gh<T>(urlPath: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${repo}${urlPath}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (res.status === 404) return null as T
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub API ${res.status}: ${text}`)
  }
  if (res.status === 204) return null as T
  return (await res.json()) as T
}

/** Download remote SQLite (if any) then open local connection. */
export async function pullDatabaseFromGitHub() {
  if (!enabled()) {
    console.log('[sync] GitHub data sync disabled (set DATA_GITHUB_REPO + GITHUB_TOKEN)')
    reopenDatabase()
    return
  }

  const file = await gh<GhFile>(
    `/contents/${remotePath}?ref=${encodeURIComponent(branch)}`,
  )
  if (file?.content) {
    const bin = Buffer.from(file.content, (file.encoding as BufferEncoding) || 'base64')
    fs.writeFileSync(dbPath, bin)
    console.log(
      `[sync] Restored database from ${repo}@${branch}:${remotePath} (${bin.length} bytes)`,
    )
  } else {
    console.log('[sync] No remote database yet — will create on first save')
  }
  reopenDatabase()
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let saving = false

async function pushOnce() {
  if (!enabled() || saving) return
  saving = true
  try {
    const { getDb } = await import('./db.js')
    getDb().pragma('wal_checkpoint(TRUNCATE)')
    const bin = fs.readFileSync(dbPath)

    const repoInfo = await gh<{ default_branch: string }>('')
    const defaultBranch = repoInfo?.default_branch || 'master'
    const ref = await gh<{ object: { sha: string } } | null>(`/git/ref/heads/${branch}`)
    if (!ref) {
      const base = await gh<{ object: { sha: string } }>(`/git/ref/heads/${defaultBranch}`)
      if (base?.object?.sha) {
        await gh(`/git/refs`, {
          method: 'POST',
          body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }),
        })
      }
    }

    const existing = await gh<GhFile>(
      `/contents/${remotePath}?ref=${encodeURIComponent(branch)}`,
    )

    await gh(`/contents/${remotePath}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `chore: sync dictation database ${new Date().toISOString()}`,
        content: bin.toString('base64'),
        branch,
        sha: existing?.sha,
      }),
    })
    console.log(`[sync] Saved database to ${repo}@${branch}:${remotePath}`)
  } catch (err) {
    console.error('[sync] Failed to push database', err)
  } finally {
    saving = false
  }
}

export function scheduleDatabasePush() {
  if (!enabled()) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void pushOnce()
  }, 1500)
}

export function githubSyncEnabled() {
  return enabled()
}
