import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	timingSafeEqual,
} from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const VERSION = 'v1'

/**
 * Returns true if the value appears to already be encrypted (has our version prefix).
 * Used during the plaintext→encrypted migration of legacy values.
 */
export function isEncryptedSecret(value: string): boolean {
	return value.startsWith(`${VERSION}:`)
}

function getKey(): Buffer {
	const raw = process.env.TOKEN_ENCRYPTION_KEY
	if (!raw) {
		throw new Error('TOKEN_ENCRYPTION_KEY is not set')
	}
	const key = Buffer.from(raw, 'base64')
	if (key.length !== 32) {
		throw new Error(
			'TOKEN_ENCRYPTION_KEY must decode to 32 bytes (base64 of 32 random bytes)',
		)
	}
	return key
}

/**
 * Encrypt a secret at rest using AES-256-GCM.
 * Output format: v1:<iv-hex>:<ciphertext-hex>:<authtag-hex>
 */
export function encryptSecret(plaintext: string): string {
	const key = getKey()
	const iv = randomBytes(IV_LENGTH)
	const cipher = createCipheriv(ALGORITHM, key, iv)
	const ciphertext = Buffer.concat([
		cipher.update(plaintext, 'utf8'),
		cipher.final(),
	])
	const authTag = cipher.getAuthTag()
	return [
		VERSION,
		iv.toString('hex'),
		ciphertext.toString('hex'),
		authTag.toString('hex'),
	].join(':')
}

/**
 * Decrypt an AES-256-GCM encrypted value. Throws on tamper or format mismatch.
 */
export function decryptSecret(encrypted: string): string {
	const parts = encrypted.split(':')
	if (parts.length !== 4) {
		throw new Error('Invalid encrypted value format')
	}
	const [version, ivHex, ctHex, tagHex] = parts
	if (version !== VERSION) {
		throw new Error(`Unsupported encryption version: ${version}`)
	}
	const iv = Buffer.from(ivHex, 'hex')
	const ciphertext = Buffer.from(ctHex, 'hex')
	const authTag = Buffer.from(tagHex, 'hex')
	if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
		throw new Error('Invalid iv or auth tag length')
	}
	const key = getKey()
	const decipher = createDecipheriv(ALGORITHM, key, iv)
	decipher.setAuthTag(authTag)
	const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
	return plaintext.toString('utf8')
}

/**
 * Constant-time string equality — wraps timingSafeEqual with length guard.
 */
export function secureStringEquals(a: string, b: string): boolean {
	const aBuf = Buffer.from(a, 'utf8')
	const bBuf = Buffer.from(b, 'utf8')
	if (aBuf.length !== bBuf.length) return false
	return timingSafeEqual(aBuf, bBuf)
}
