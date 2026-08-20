import type { Context } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getClientIp } from './client-ip'

/** Minimal Context-stub — getClientIp rör bara c.req.header(). */
const contextWith = (headers: Record<string, string>): Context =>
	({
		req: {
			header: (name: string) => headers[name.toLowerCase()],
		},
	}) as unknown as Context

describe('getClientIp', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it('föredrar X-Real-IP, som proxyn skriver över', () => {
		const c = contextWith({
			'x-real-ip': '203.0.113.7',
			'x-forwarded-for': '198.51.100.1, 203.0.113.7',
		})
		expect(getClientIp(c)).toBe('203.0.113.7')
	})

	it('tar sista hoppet i X-Forwarded-For, inte det första', () => {
		// Första elementet är klientstyrt; sista sattes av vår nginx.
		const c = contextWith({
			'x-forwarded-for': '1.2.3.4, 203.0.113.7',
		})
		expect(getClientIp(c)).toBe('203.0.113.7')
	})

	it('går inte att spoofa via klientstyrd X-Forwarded-For', () => {
		// Angriparen skickar en påhittad XFF; nginx appendar den riktiga IP:n.
		const spoofed = contextWith({
			'x-forwarded-for': '9.9.9.9, 203.0.113.7',
		})
		const honest = contextWith({ 'x-forwarded-for': '203.0.113.7' })
		// Samma rate-limit-nyckel — angriparen får ingen ny hink.
		expect(getClientIp(spoofed)).toBe(getClientIp(honest))
	})

	it('ignorerar CF-Connecting-IP när Cloudflare inte är betrodd', () => {
		const c = contextWith({
			'cf-connecting-ip': '9.9.9.9',
			'x-real-ip': '203.0.113.7',
		})
		expect(getClientIp(c)).toBe('203.0.113.7')
	})

	it('ger ingen ny nyckel per påhittad CF-Connecting-IP', () => {
		const first = contextWith({
			'cf-connecting-ip': '1.1.1.1',
			'x-real-ip': '203.0.113.7',
		})
		const second = contextWith({
			'cf-connecting-ip': '2.2.2.2',
			'x-real-ip': '203.0.113.7',
		})
		expect(getClientIp(first)).toBe(getClientIp(second))
	})

	it('använder CF-Connecting-IP när TRUST_CLOUDFLARE_HEADERS är satt', () => {
		vi.stubEnv('TRUST_CLOUDFLARE_HEADERS', 'true')
		const c = contextWith({
			'cf-connecting-ip': '198.51.100.9',
			'x-real-ip': '203.0.113.7',
		})
		expect(getClientIp(c)).toBe('198.51.100.9')
	})

	it('faller tillbaka på X-Real-IP om CF-headern saknas trots trust', () => {
		vi.stubEnv('TRUST_CLOUDFLARE_HEADERS', 'true')
		const c = contextWith({ 'x-real-ip': '203.0.113.7' })
		expect(getClientIp(c)).toBe('203.0.113.7')
	})

	it("returnerar 'unknown' utan betrodda headers", () => {
		expect(getClientIp(contextWith({}))).toBe('unknown')
	})

	it('trimmar whitespace i headervärden', () => {
		expect(getClientIp(contextWith({ 'x-real-ip': '  203.0.113.7  ' }))).toBe(
			'203.0.113.7',
		)
	})

	it('hoppar över tomma headervärden', () => {
		const c = contextWith({
			'x-real-ip': '   ',
			'x-forwarded-for': '203.0.113.7',
		})
		expect(getClientIp(c)).toBe('203.0.113.7')
	})
})
