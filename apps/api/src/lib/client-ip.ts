import type { Context } from 'hono'

/**
 * Klientens IP-adress, avsedd som nyckel för rate limiting.
 *
 * Trust model: exakt ett proxy-hopp (CapRovers nginx) står framför appen.
 * Headers som klienten själv skickar går rakt igenom det hoppet — nginx
 * strippar inte okända headers. Därför får vi bara lita på värden som proxyn
 * bevisligen har skrivit över:
 *
 * - `X-Real-IP` sätts av nginx med `proxy_set_header X-Real-IP $remote_addr`,
 *   vilket ersätter ett eventuellt klientvärde. Trovärdig.
 * - `X-Forwarded-For` byggs med `$proxy_add_x_forwarded_for`, som APPENDAR
 *   till det klienten skickade. Bara sista elementet är satt av vår proxy;
 *   allt före det är fritt klientstyrt.
 * - `CF-Connecting-IP` skrivs över av Cloudflare — men bara om trafiken
 *   faktiskt passerar Cloudflare. Går appen att nå direkt på origin är
 *   headern helt spoofbar, så den läses bara när TRUST_CLOUDFLARE_HEADERS
 *   uttryckligen är satt.
 *
 * Utan trovärdig header returneras 'unknown', vilket lägger alla sådana
 * requests i samma rate-limit-hink. Det är avsiktligt konservativt: hellre
 * för hård begränsning än en nyckel en angripare kan välja fritt.
 */
export function getClientIp(c: Context): string {
	if (process.env.TRUST_CLOUDFLARE_HEADERS === 'true') {
		const cfIp = c.req.header('cf-connecting-ip')?.trim()
		if (cfIp) return cfIp
	}

	const realIp = c.req.header('x-real-ip')?.trim()
	if (realIp) return realIp

	const forwardedFor = c.req.header('x-forwarded-for')
	if (forwardedFor) {
		const hops = forwardedFor.split(',')
		const nearest = hops[hops.length - 1]?.trim()
		if (nearest) return nearest
	}

	return 'unknown'
}
