import { TableClient } from "@azure/data-tables";
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";

// --- Types ---

export interface SessionMetadata {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "error";
  text: string;
}

// --- Storage interface ---

export interface SessionStore {
  /** List all sessions for a user (identified by tokenHash) */
  listSessions(tokenHash: string): Promise<SessionMetadata[]>;
  /** Get metadata for a single session */
  getSession(tokenHash: string, sessionId: string): Promise<SessionMetadata | null>;
  /** Save/update session metadata */
  saveSession(tokenHash: string, meta: SessionMetadata): Promise<void>;
  /** Delete a session and its messages */
  deleteSession(tokenHash: string, sessionId: string): Promise<boolean>;
  /** Get chat messages for a session */
  getMessages(tokenHash: string, sessionId: string): Promise<ChatMessage[]>;
  /** Save chat messages for a session */
  saveMessages(tokenHash: string, sessionId: string, messages: ChatMessage[]): Promise<void>;
}

// --- Hash helper ---

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- In-memory store (fallback when no Azure connection string) ---

export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, SessionMetadata>();
  private messages = new Map<string, ChatMessage[]>();

  private key(tokenHash: string, sessionId: string): string {
    return `${tokenHash}:${sessionId}`;
  }

  async listSessions(tokenHash: string): Promise<SessionMetadata[]> {
    const result: SessionMetadata[] = [];
    const prefix = `${tokenHash}:`;
    for (const [key, meta] of this.sessions) {
      if (key.startsWith(prefix)) {
        result.push(meta);
      }
    }
    result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return result;
  }

  async getSession(tokenHash: string, sessionId: string): Promise<SessionMetadata | null> {
    return this.sessions.get(this.key(tokenHash, sessionId)) ?? null;
  }

  async saveSession(tokenHash: string, meta: SessionMetadata): Promise<void> {
    this.sessions.set(this.key(tokenHash, meta.id), meta);
  }

  async deleteSession(tokenHash: string, sessionId: string): Promise<boolean> {
    const k = this.key(tokenHash, sessionId);
    const existed = this.sessions.has(k) || this.messages.has(k);
    this.sessions.delete(k);
    this.messages.delete(k);
    return existed;
  }

  async getMessages(tokenHash: string, sessionId: string): Promise<ChatMessage[]> {
    return this.messages.get(this.key(tokenHash, sessionId)) ?? [];
  }

  async saveMessages(tokenHash: string, sessionId: string, messages: ChatMessage[]): Promise<void> {
    this.messages.set(this.key(tokenHash, sessionId), messages);
  }
}

// --- Azure Storage store ---

const TABLE_NAME = "sessions";
const BLOB_CONTAINER = "chatmessages";

export class AzureSessionStore implements SessionStore {
  private tableClient: TableClient;
  private containerClient: ContainerClient;

  constructor(connectionString: string) {
    this.tableClient = TableClient.fromConnectionString(connectionString, TABLE_NAME);
    const blobService = BlobServiceClient.fromConnectionString(connectionString);
    this.containerClient = blobService.getContainerClient(BLOB_CONTAINER);
  }

  async initialize(): Promise<void> {
    await this.tableClient.createTable().catch((err) => {
      // Ignore "TableAlreadyExists"
      if (err?.statusCode !== 409) throw err;
    });
    await this.containerClient.createIfNotExists();
  }

  async listSessions(tokenHash: string): Promise<SessionMetadata[]> {
    const result: SessionMetadata[] = [];
    const iter = this.tableClient.listEntities<SessionMetadata & { partitionKey: string; rowKey: string }>({
      queryOptions: { filter: `PartitionKey eq '${tokenHash}'` },
    });
    for await (const entity of iter) {
      result.push({
        id: entity.rowKey,
        title: entity.title,
        model: entity.model,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      });
    }
    result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return result;
  }

  async getSession(tokenHash: string, sessionId: string): Promise<SessionMetadata | null> {
    try {
      const entity = await this.tableClient.getEntity<SessionMetadata>(tokenHash, sessionId);
      return {
        id: sessionId,
        title: entity.title,
        model: entity.model,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      };
    } catch (err: any) {
      if (err?.statusCode === 404) return null;
      throw err;
    }
  }

  async saveSession(tokenHash: string, meta: SessionMetadata): Promise<void> {
    await this.tableClient.upsertEntity(
      {
        partitionKey: tokenHash,
        rowKey: meta.id,
        title: meta.title,
        model: meta.model,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      },
      "Merge"
    );
  }

  async deleteSession(tokenHash: string, sessionId: string): Promise<boolean> {
    try {
      await this.tableClient.deleteEntity(tokenHash, sessionId);
    } catch (err: any) {
      if (err?.statusCode !== 404) throw err;
    }

    // Delete blob
    const blobName = `${tokenHash}/${sessionId}.json`;
    const blobClient = this.containerClient.getBlockBlobClient(blobName);
    await blobClient.deleteIfExists();
    return true;
  }

  async getMessages(tokenHash: string, sessionId: string): Promise<ChatMessage[]> {
    const blobName = `${tokenHash}/${sessionId}.json`;
    const blobClient = this.containerClient.getBlockBlobClient(blobName);
    try {
      const response = await blobClient.download(0);
      const body = await streamToString(response.readableStreamBody!);
      return JSON.parse(body) as ChatMessage[];
    } catch (err: any) {
      if (err?.statusCode === 404) return [];
      throw err;
    }
  }

  async saveMessages(tokenHash: string, sessionId: string, messages: ChatMessage[]): Promise<void> {
    const blobName = `${tokenHash}/${sessionId}.json`;
    const blobClient = this.containerClient.getBlockBlobClient(blobName);
    const content = JSON.stringify(messages);
    await blobClient.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: "application/json" },
    });
  }
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// --- Factory ---

export function createSessionStore(connectionString?: string): SessionStore {
  if (connectionString) {
    return new AzureSessionStore(connectionString);
  }
  return new InMemorySessionStore();
}
