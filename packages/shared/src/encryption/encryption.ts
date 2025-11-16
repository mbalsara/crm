import crypto from 'crypto';
import { SecretClient } from '@crm/cloud-google';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

const SECRET_NAME = 'crm-encryption-key';

export class EncryptionService {
  private secretKey: Buffer | null = null;

  /**
   * Initialize encryption key from Secret Manager
   */
  private async getSecretKey(): Promise<Buffer> {
    if (this.secretKey) {
      return this.secretKey;
    }

    // Try to get from Secret Manager first
    let secret = await SecretClient.getCachedSecretValue(SECRET_NAME);

    // Fallback to environment variable for local development
    if (!secret) {
      secret = process.env.ENCRYPTION_SECRET;
      console.warn('Using ENCRYPTION_SECRET from environment variable. Use Secret Manager in production.');
    }

    if (!secret) {
      throw new Error(
        'Encryption key not found. Set up Secret Manager with key "crm-encryption-key" or set ENCRYPTION_SECRET env var.'
      );
    }

    // Derive a key from the secret using scrypt
    this.secretKey = crypto.scryptSync(secret, 'salt', KEY_LENGTH);

    return this.secretKey;
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  async encrypt(plaintext: string): Promise<string> {
    const key = await this.getSecretKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    // Format: iv:tag:encrypted
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt data encrypted with AES-256-GCM
   */
  async decrypt(ciphertext: string): Promise<string> {
    const key = await this.getSecretKey();
    const parts = ciphertext.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivHex, tagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Encrypt JSON object
   */
  async encryptJSON<T = any>(data: T): Promise<string> {
    return this.encrypt(JSON.stringify(data));
  }

  /**
   * Decrypt to JSON object
   */
  async decryptJSON<T = any>(ciphertext: string): Promise<T> {
    const decrypted = await this.decrypt(ciphertext);
    return JSON.parse(decrypted);
  }
}

// Singleton instance
export const encryption = new EncryptionService();
