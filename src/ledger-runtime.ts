/**
 * Runtime half of the per-session cost ledger. It owns the storage-domain
 * sidecar table, listens to committed session events, and writes one immutable
 * price entry per billed step (only steps committed after this plugin version
 * is installed — no backfill). It also reconciles archived sessions and
 * deletes their ledger records.
 */
import {
  applyEntry,
  buildCostEntry,
  foldModel,
  LEDGER_DOMAIN_SPEC,
  seedFold,
  snapshotRecord,
  usageSampleOf,
  type CostEntry,
  type LedgerEventLike,
  type LedgerSessionLike,
  type SessionCostRecord,
  type SessionFold,
  type SessionLedgerSnapshot,
} from './ledger.ts'
import type { CostConfig, Currency } from './pricing.ts'

/** Storage-domain KV table face used by the ledger. */
export interface KvTableLike<K extends string, V> {
  get(key: K): V | undefined
  put(key: K, value: V): Promise<void>
  delete(key: K): Promise<boolean>
  keys(): IterableIterator<K>
}

/** Opened storage-domain face used by the ledger. */
export interface DomainLike {
  table(name: string): KvTableLike<string, SessionCostRecord>
  close(): Promise<void>
}

/** `ctx.storageDomain` structural face. */
export interface StorageDomainLike {
  open(spec: unknown): Promise<DomainLike>
}

/** `ctx.workspaceRegistry` structural face (optional service). */
export interface WorkspaceRegistryLike {
  readonly archivedSessionIds: readonly string[]
}

/** Host context face the ledger runtime consumes. */
export interface LedgerRuntimeContextLike {
  on(name: string, listener: (...args: any[]) => void): () => void
  logger: {
    warn(message: string): void
  }
  storageDomain: StorageDomainLike
  /** Optional-service lookup; unlike property access it never throws without inject. */
  get(name: 'workspaceRegistry'): WorkspaceRegistryLike | undefined
}

/** Archive reconciliation interval. */
const ARCHIVE_RECONCILE_MS = 30_000

/** Route-level read result. */
export type LedgerReadResult =
  | { kind: 'ready'; snapshot: SessionLedgerSnapshot }
  | { kind: 'archived' }
  | { kind: 'unavailable' }

/** Queued table operation; resolve to void even when the job fails. */
type SettledTail = Promise<void>

/**
 * The ledger runtime for one mounted plugin instance. Event observation is
 * synchronous; every storage write is queued per session so read-modify-write
 * updates of one session never interleave.
 */
export class CostLedgerRuntime {
  private domain: DomainLike | undefined
  private table: KvTableLike<string, SessionCostRecord> | undefined
  private ready: Promise<void> | undefined
  private opened = false
  private closed = false
  private stopEvent: (() => void) | undefined
  private archiveTimer: ReturnType<typeof setInterval> | undefined
  private readonly folds = new WeakMap<object, SessionFold>()
  private readonly tails = new Map<string, SettledTail>()
  private readonly allTails = new Set<SettledTail>()

  constructor(
    private readonly ctx: LedgerRuntimeContextLike,
    private readonly readConfig: () => CostConfig | undefined,
  ) {}

  /** Open the sidecar domain and start observing committed session events. */
  open(): void {
    if (this.opened) return
    this.opened = true
    this.ready = this.ctx.storageDomain.open(LEDGER_DOMAIN_SPEC)
      .then((domain) => {
        if (this.closed) {
          return domain.close().then(() => undefined)
        }
        this.domain = domain
        this.table = domain.table('sessions')
      })
      .catch((error: unknown) => {
        this.ctx.logger.warn(`dsh-cost-meter: cost ledger domain unavailable: ${String(error)}`)
        throw error
      })
    this.stopEvent = this.ctx.on('session/event', (session: LedgerSessionLike, event: LedgerEventLike) => {
      this.onEvent(session, event)
    })
    this.archiveTimer = setInterval(() => {
      void this.reconcileArchived()
    }, ARCHIVE_RECONCILE_MS)
  }

  /** Stop observing, drain queued writes, and close the sidecar domain. */
  async dispose(): Promise<void> {
    this.closed = true
    this.stopEvent?.()
    this.stopEvent = undefined
    if (this.archiveTimer !== undefined) clearInterval(this.archiveTimer)
    await this.ready?.catch(() => undefined)
    await Promise.allSettled([...this.allTails])
    await this.domain?.close()
    this.domain = undefined
    this.table = undefined
  }

  /** Read one session's ledger, deleting the row first when the session is archived. */
  async read(sessionId: string): Promise<LedgerReadResult> {
    if (this.table === undefined) {
      try {
        await this.ready
      } catch {
        return { kind: 'unavailable' }
      }
    }
    if (this.closed || this.table === undefined) return { kind: 'unavailable' }
    if (this.isArchived(sessionId)) {
      await this.deleteSession(sessionId)
      return { kind: 'archived' }
    }
    return { kind: 'ready', snapshot: snapshotRecord(this.table.get(sessionId)) }
  }

  /**
   * True when any durable entry was billed in a currency different from
   * `currency`. Used to refuse currency switches once billing has started:
   * immutable snapshots in two currencies cannot be summed meaningfully.
   */
  async hasForeignEntries(currency: Currency): Promise<boolean> {
    if (this.closed) return false
    if (this.table === undefined) {
      try {
        await this.ready
      } catch {
        return false
      }
    }
    if (this.closed || this.table === undefined) return false
    for (const key of this.table.keys()) {
      const record = this.table.get(key)
      if (record === undefined) continue
      for (const entry of Object.values(record.entries)) {
        if (entry.currency !== currency) return true
      }
    }
    return false
  }

  /** Delete ledger rows for every session currently in the archive set. */
  async reconcileArchived(): Promise<void> {
    if (this.closed) return
    if (this.table === undefined) {
      try {
        await this.ready
      } catch {
        return
      }
    }
    if (this.closed || this.table === undefined) return
    const archived = this.ctx.get('workspaceRegistry')?.archivedSessionIds
    if (archived === undefined || archived.length === 0) return
    const archivedSet = new Set<string>(archived)
    const victims: string[] = []
    for (const key of this.table.keys()) {
      if (archivedSet.has(key)) victims.push(key)
    }
    await Promise.all(victims.map(sessionId => this.deleteSession(sessionId)))
  }

  private onEvent(session: LedgerSessionLike, event: LedgerEventLike): void {
    if (this.closed) return
    let state = this.folds.get(session)
    if (state === undefined) {
      state = seedFold(session.events, event.seq)
    }
    const next = foldModel(state, event)
    if (next !== state) this.folds.set(session, next)
    const sample = usageSampleOf(event)
    if (sample === null) return
    const config = this.readConfig()
    if (config === undefined) return
    const entry: CostEntry = buildCostEntry(config, next.model, sample, event.time)
    void this.enqueue(session.id, async () => {
      if (this.closed) return
      try {
        await this.ready
      } catch {
        return
      }
      if (this.table === undefined) return
      const current = this.table.get(session.id) ?? { sessionId: session.id, entries: {} }
      const updated = applyEntry(current, entry)
      if (updated !== current) await this.table.put(session.id, updated)
    })
  }

  /** Serialize one session's ledger mutations (per-session tail; the domain chain also serializes). */
  private enqueue(sessionId: string, job: () => Promise<void>): SettledTail {
    const previous = this.tails.get(sessionId) ?? Promise.resolve()
    const next = previous.then(job, job)
    const settled: SettledTail = next.catch((error: unknown) => {
      this.ctx.logger.warn(`dsh-cost-meter: ledger write for "${sessionId}" failed: ${String(error)}`)
    })
    this.tails.set(sessionId, settled)
    this.allTails.add(settled)
    void settled.finally(() => {
      if (this.tails.get(sessionId) === settled) this.tails.delete(sessionId)
      this.allTails.delete(settled)
    })
    return settled
  }

  private async deleteSession(sessionId: string): Promise<void> {
    await this.enqueue(sessionId, async () => {
      if (this.closed) return
      try {
        await this.ready
      } catch {
        return
      }
      if (this.table !== undefined) await this.table.delete(sessionId)
    })
  }

  private isArchived(sessionId: string): boolean {
    return this.ctx.get('workspaceRegistry')?.archivedSessionIds.includes(sessionId) ?? false
  }
}
