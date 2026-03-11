// Fleet state store for multi-agent fleet mode.
// Follows the same pattern as InMemoryPlanningStore in planning-store.ts.

// --- Types ---

/**
 * Represents an active or completed multi-agent fleet.
 * A fleet is started via session.rpc.fleet.start() and scoped to a single session.
 */
export interface Fleet {
  /** Unique identifier for this fleet (UUID generated at runtime). */
  id: string;

  /** The session ID this fleet was started in. */
  sessionId: string;

  /** SHA-256 hash of the user's token — used for per-user isolation. */
  tokenHash: string;

  /**
   * Current status of the fleet.
   * - `started`: Fleet has been successfully launched
   * - `running`: Fleet is actively processing with sub-agents
   * - `completed`: Fleet has finished all work
   * - `failed`: Fleet encountered an error
   */
  status: "started" | "running" | "completed" | "failed";

  /** Optional prompt provided when starting the fleet. */
  prompt?: string;

  /** Number of active sub-agents in this fleet. */
  subagentCount: number;

  /** ISO 8601 timestamp of when this fleet was started. */
  startedAt: string;

  /** ISO 8601 timestamp of when this fleet metadata was last updated. */
  updatedAt: string;
}

// --- Valid enum sets for validation ---

const VALID_FLEET_STATUSES: ReadonlySet<Fleet["status"]> = new Set([
  "started",
  "running",
  "completed",
  "failed",
]);

// --- FleetStore interface ---

/**
 * Storage contract for fleet entities.
 * All methods are async to support future Azure Storage implementation.
 */
export interface FleetStore {
  /** Persist a new Fleet. Throws if required fields are missing or invalid. */
  createFleet(fleet: Fleet): Promise<Fleet>;

  /** Retrieve a Fleet by ID. Returns null if not found. */
  getFleet(fleetId: string): Promise<Fleet | null>;

  /**
   * Apply partial updates to a Fleet. `id`, `startedAt`, `sessionId`, and `tokenHash`
   * cannot be changed. Returns null if the Fleet does not exist.
   */
  updateFleet(
    fleetId: string,
    updates: Partial<Omit<Fleet, "id" | "startedAt" | "sessionId" | "tokenHash">>
  ): Promise<Fleet | null>;

  /** List all Fleets belonging to a user (by tokenHash), ordered by startedAt descending. */
  listFleets(tokenHash: string): Promise<Fleet[]>;
}

// --- Validation helpers ---

function requireNonEmpty(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${fieldName}: must be a non-empty string`);
  }
}

function requireValidEnum<T extends string>(
  value: T,
  allowed: ReadonlySet<T>,
  fieldName: string
): void {
  if (!allowed.has(value)) {
    throw new Error(
      `Invalid ${fieldName}: "${value}" is not one of [${[...allowed].join(", ")}]`
    );
  }
}

function requireNonNegativeNumber(value: number, fieldName: string): void {
  if (typeof value !== "number" || value < 0) {
    throw new Error(`Invalid ${fieldName}: must be a non-negative number`);
  }
}

function validateFleet(fleet: Fleet): void {
  requireNonEmpty(fleet.id, "id");
  requireNonEmpty(fleet.sessionId, "sessionId");
  requireNonEmpty(fleet.tokenHash, "tokenHash");
  requireValidEnum(fleet.status, VALID_FLEET_STATUSES, "status");
  requireNonNegativeNumber(fleet.subagentCount, "subagentCount");
  requireNonEmpty(fleet.startedAt, "startedAt");
  requireNonEmpty(fleet.updatedAt, "updatedAt");
}

// --- InMemoryFleetStore ---

export class InMemoryFleetStore implements FleetStore {
  private fleets = new Map<string, Fleet>();

  async createFleet(fleet: Fleet): Promise<Fleet> {
    validateFleet(fleet);
    this.fleets.set(fleet.id, structuredClone(fleet));
    return structuredClone(fleet);
  }

  async getFleet(fleetId: string): Promise<Fleet | null> {
    const fleet = this.fleets.get(fleetId);
    return fleet ? structuredClone(fleet) : null;
  }

  async updateFleet(
    fleetId: string,
    updates: Partial<Omit<Fleet, "id" | "startedAt" | "sessionId" | "tokenHash">>
  ): Promise<Fleet | null> {
    const existing = this.fleets.get(fleetId);
    if (!existing) return null;

    if (updates.status !== undefined) requireValidEnum(updates.status, VALID_FLEET_STATUSES, "status");
    if (updates.updatedAt !== undefined) requireNonEmpty(updates.updatedAt, "updatedAt");
    if (updates.subagentCount !== undefined) requireNonNegativeNumber(updates.subagentCount, "subagentCount");

    const updated: Fleet = { ...existing, ...updates, id: existing.id, startedAt: existing.startedAt, sessionId: existing.sessionId, tokenHash: existing.tokenHash };
    this.fleets.set(fleetId, updated);
    return structuredClone(updated);
  }

  async listFleets(tokenHash: string): Promise<Fleet[]> {
    const result: Fleet[] = [];
    for (const fleet of this.fleets.values()) {
      if (fleet.tokenHash === tokenHash) result.push(structuredClone(fleet));
    }
    result.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return result;
  }
}
