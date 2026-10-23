# Säkerhetsaudit — time-report

## Kontext

Projektet `time-report` ska göras publikt på internet. Ägaren är orolig för att känslig data (projekt, tider, priser, kunduppgifter) ska läcka till obehöriga. Målet med denna audit är att identifiera konkreta hot som kan leda till dataläckage eller kontoövertagande, och prioritera åtgärder som bör landa **innan första publika deploy**.

Auditen gick igenom hela monorepon: Hono-API, React/Vite-frontend, Prisma-scheman, Docker-image, nginx-konfig, CI-workflow och alla routes/services. Tre parallella explore-agenter kartlade koden; därefter verifierades varje fynd mot faktisk kod — flera agent-rapporterade fynd var felaktiga (se "Invaliderade rapporter" i slutet).

Systemet har redan ett starkt grundskydd: per-user SQLite-filer (mycket stark IDOR-isolation), AES-256-GCM för Box-tokens, `jose` för JWT, timing-safe OTP-jämförelse, hashade OTP i DB, startup-assertions för kritiska env-vars i prod, strikt CSP/X-Frame/HSTS via nginx, strikt Zod-validering på alla routes, och rate limiting på OTP-endpoints. Det som återstår är primärt finjustering av auth-hårdhet och ops-läckage.

Endast fynd med severity **kritisk**, **hög** och **medel** rapporteras. Lågrisk/nice-to-have är medvetet utelämnat.

---

## Fynd per severity

### KRITISKA

#### K1. Cookie `secure`-flagga beror på `NODE_ENV === 'production'` — en felaktig env-variabel skickar access/refresh tokens i klartext

- **Fil:** `apps/api/src/lib/jwt.ts:97-106`
- **Problem:** Om APIet körs med `NODE_ENV=staging`, `production ` (med space), eller glöms att sättas, blir `secure: false`. Cookien skickas då över HTTP och kan snappas upp av MITM på samma nätverk eller via en komprometterad reverse proxy.
- **Exploit:** Angripare lyssnar på Wi-Fi/LAN eller sitter i en proxykedja utan TLS-terminering, läser `refresh_token`-cookien, får full kontroll i 7 dagar.
- **Fix:** Bind `secure` till att `FRONTEND_URL` börjar med `https://` (eller sätt alltid `true` i koden och kräv HTTPS i dev via en lokal proxy). Komplettera befintlig startup-assertion i `apps/api/src/index.ts:18-47` med `if (!cookieWillBeSecure) throw`.

#### K2. Entrypoint loggar `AUTH_DATABASE_URL` ordagrant till stdout — en framtida Postgres-URL läcker credentials till container-loggar

- **Fil:** `docker/api-entrypoint.sh:10`
- **Problem:** `echo "[entrypoint] AUTH_DATABASE_URL=${AUTH_DATABASE_URL:-<unset>}"` skriver hela URL:en. I SQLite-fallet (`file:./data/auth.db`) är detta harmlöst, men enligt `AGENTS.md:15` är prod-planen Postgres. En URL av typen `postgresql://user:password@host/db` hamnar då i varje container-start-log som CapRover, log-aggregators eller driftpersonal kan läsa.
- **Exploit:** Den som får läsa container-loggar (CapRover-användare, backup-system, loggaggregator) får DB-root-credentials och kan läsa hela `authDb` — inklusive alla e-postadresser och krypterade Box-tokens.
- **Fix:** Logga bara `"set"` / `"<unset>"` istället för värdet. Samma sak för `DATA_DIR` (harmless idag men samma princip).

---

### HÖGA

#### H1. Ingen rate limiting på autentiserade endpoints — en stulen access token kan exfiltrera all data snabbt

- **Fil:** `apps/api/src/index.ts:56-79` (middleware-listan saknar rate limit)
- **Problem:** Endast `/api/auth/request-otp` och `/api/auth/verify-otp` har `rateLimiter`. Alla andra endpoints (`/api/projects`, `/api/time-entries`, `/api/reports`, `/api/box/sync`) är obegränsade. En angripare med access token (stulen via framtida XSS, via en komprometterad arbetsdator, eller via delat kaffehus-Wi-Fi före K1 är fixad) kan exfiltrera hela kontot inom sekunder och utan spår.
- **Exploit:** Angripare stjäl access_token, kör en loop som polar alla endpoints. Ingen alert, ingen begränsning, full data-dump.
- **Fix:** Lägg till global rate limit på `/api/*` efter `requireAuth`, t.ex. 300 req/min per userId + 60 req/min per IP. Återanvänd `hono-rate-limiter` som redan finns importerad.

#### H2. OTP-verifiering tillåter effektivt 15 gissningar/IP/15 min — distribuerat räcker för brute force

- **Fil:** `apps/api/src/routes/auth.ts:30-37` + `apps/api/src/services/auth.service.ts:29-56`
- **Problem:** `verifyOtpLimiter` tillåter 10 försök per IP/15 min. `requestOtp` tillåter 3 per IP/15 min. Varje ny OTP nollställer `otpRecord.attempts`, så i praktiken: 3 nya koder × max 5 försök per kod = 15 gissningar/IP/15 min. För 6 siffror (1 000 000 möjligheter) tar det år från en IP — men med t.ex. 1 000 residential proxies når en angripare ~1 miljon gissningar per dygn och kan knäcka valfri användares kod.
- **Exploit:** Angripare vet e-postadressen till ägaren. Roterar IP:n, brute-forcar OTP i bakgrunden under flera dagar, loggar in som ägaren.
- **Fix:** Lägg till en **email-bunden counter** i `authDb.otpCode` eller i en ny tabell: "max N misslyckade verifieringar per email per rullande timma — sedan lås inloggningen i X min och skicka mailvarning." Detta är oberoende av IP och blockerar distribuerade attacker.

#### H3. CSRF-middlewaren får `origin: undefined` om `FRONTEND_URL` saknas i dev

- **Fil:** `apps/api/src/index.ts:73-78`
- **Problem:** `csrf({ origin: ALLOWED_ORIGIN || undefined })`. I prod skyddas detta av startup-assertion (`index.ts:24-29`), men i dev utan `FRONTEND_URL` blir origin `undefined`. Hono CSRF-middlewaren tolkar då Origin löst (faller tillbaka till Host-jämförelse). Om en utvecklingsserver någonsin exponeras mot internet kan `attacker.com` skicka state-ändrande requests utan Origin-kontroll.
- **Exploit:** Lägre sannolikhet (dev-only), men realistisk vid tunnlar som ngrok/Cloudflare Tunnel för demo.
- **Fix:** Kräv explicit origin alltid: `csrf({ origin: ALLOWED_ORIGIN })` (ta bort `|| undefined`). ALLOWED_ORIGIN default-värdet `http://localhost:5173` är redan korrekt — men säkerställ att ingen kodpath gör den tom.

#### H4. Ingen reuse-detection på refresh tokens — en stulen token kan användas utan att ägaren märker det

- **Fil:** `apps/api/src/services/auth.service.ts:186-232`
- **Problem:** När refresh token roteras skrivs den gamla över i DB. En angripare som stjäl tokenen och använder den **före** den legitima användaren får nya giltiga tokens (7 dagar). Den legitima användarens nästa refresh misslyckas tyst — ingen varning, ingen auto-logout, ingen alert.
- **Exploit:** Angripare stjäl cookie via MITM (K1), XSS eller delad dator. Kör refresh innan användaren öppnar appen igen. Användaren ser bara att de blir utloggade nästa gång de öppnar appen, och skyller på att sessionen "gick ut".
- **Fix:** Lägg till `jti`-tracking på `authDb.session`. Vid refresh: om token-hashen inte matchar den senaste men ändå dekrypteras med rätt secret (dvs. en tidigare-rotad token används), invalidera **alla** sessioner för användaren och skicka e-postvarning. Standardmönster ("refresh token reuse detection" enligt OWASP).

---

### MEDEL

#### M1. OTP-timing-attack möjliggör enumeration av registrerade e-postadresser

- **Fil:** `apps/api/src/services/auth.service.ts:23-57`
- **Problem:** `requestOtp` gör olika DB-operationer för existerande vs ny e-post. Svarstiderna skiljer sig mätbart. En angripare kan POSTa hundratals adresser och ranka dem efter latens.
- **Exploit:** Angripare bygger en lista över vilka e-postadresser som har konton — förberedande steg för H2 (brute force).
- **Fix:** Kör `await new Promise(r => setTimeout(r, 100 + Math.random() * 50))` före return, och håll samma kodpath oavsett om raden existerar eller inte. Skicka aldrig olika svar beroende på om e-post är registrerad eller ej.

#### M2. Box-token krypteras med en enda global nyckel — ingen rotationsstrategi

- **Fil:** `apps/api/src/lib/crypto.ts` + `apps/api/src/routes/user.ts:114-117` + `apps/api/src/routes/box-sync.ts:93-120`
- **Problem:** `TOKEN_ENCRYPTION_KEY` används för alla användares Box-tokens. Om nyckeln läcker (env-fil läcker, CapRover-admin-konto komprometterat) kan alla tokens dekrypteras samtidigt. Det finns ingen väg att rotera nyckeln — `v1:`-prefixet antyder att man tänkt på det, men ingen kod hanterar `v2:`.
- **Exploit:** Läckt nyckel → angripare får alla Box-tokens → kan skicka falska tidrapporter på alla användares vägnar.
- **Fix:** Implementera nyckel-versionering. Stöd att dekryptera med `v1`-nyckel men alltid kryptera nytt med `v2`-nyckel. Kör migration en gång. För detta projektets skala (1 användare idag, kanske några till) räcker denna struktur som förberedelse.

#### M3. OTP loggas i klartext till stdout i dev/test

- **Fil:** `apps/api/src/lib/otp.ts:64-72`
- **Problem:** `logOtpToConsole` skriver OTP-koden till `console.log`. I dev är detta avsiktligt (ingen email-server). Problemet uppstår om `NODE_ENV` någonsin misstolkas (se K1) och koden faller tillbaka till console-logging — då skrivs varje OTP till container-loggar där driftpersonal kan läsa dem.
- **Exploit:** Kombineras med K1 eller en misconfig; loggkanaler innehåller giltiga OTP i 10 min.
- **Fix:** Gör `isDev`-checken strikt (redan så). Lägg till en andra skyddskontroll: om `process.env.RESEND_API_KEY` är satt **eller** `FRONTEND_URL` börjar med `https://`, vägra console-logga oavsett `NODE_ENV`.

#### M4. Ingen `Cache-Control`-header på API-svar

- **Fil:** `apps/api/src/index.ts` (ingen middleware för Cache-Control)
- **Problem:** JSON-svar från API:et saknar `Cache-Control: no-store`. Moderna browsrar cachar normalt inte XHR-svar med credentials, men mellanliggande proxys och browser-history kan visa data. För en publik app med känsliga priser är detta värt att täppa till.
- **Fix:** Lägg till middleware `c.header('Cache-Control', 'no-store')` + `c.header('Pragma', 'no-cache')` för alla `/api/*`-svar.

#### M5. Auth-endpoints `/api/auth/me` och `/api/auth/refresh` saknar rate limit

- **Fil:** `apps/api/src/routes/auth.ts:117-177`
- **Problem:** Endast `/request-otp` och `/verify-otp` har rate limit. `/refresh` och `/me` kan anropas obegränsat, vilket möjliggör session-probing och DoS.
- **Fix:** Lägg på en mjukare rate limit (t.ex. 60/min/IP) på `/refresh` och `/me`.

#### M6. `logoutAll` finns men exponeras inte som endpoint

- **Fil:** `apps/api/src/services/auth.service.ts:246-250`
- **Problem:** Servicen kan logga ut alla enheter, men routen saknas. Om en användare misstänker att en enhet är stulen kan de inte invalidera alla sessioner.
- **Fix:** Exponera `POST /api/auth/logout-all` (kräv `requireAuth`, radera alla sessioner för `userId`, rensa cookies).

#### M7. Felmeddelanden exponerar stack traces i icke-prod

- **Fil:** `apps/api/src/index.ts:101-116`
- **Problem:** `exposeDetails = NODE_ENV !== 'production'` innebär att i staging/test/ngrok-tunnlar skickas `err.message` till klienten. Kan innehålla Prisma-fel med DB-schema-info.
- **Fix:** Byt logiken: exponera detaljer **endast** om `NODE_ENV === 'development'`. Allt annat ska få generic `Internal server error`.

---

## Åtgärdsplan — rekommenderad ordning

### Blockerande för publik launch

1. **K1** — Tvinga `secure: true` när `FRONTEND_URL` är https, och lägg till startup-assertion för detta.
2. **K2** — Ta bort `AUTH_DATABASE_URL`-värdet från entrypoint-loggen.
3. **H1** — Global rate limit på alla `/api/*` under `requireAuth`.
4. **H2** — Email-bunden brute-force-counter för OTP-verifiering.
5. **H3** — Ta bort `|| undefined`-fallback i CSRF-origin.
6. **H4** — Refresh token reuse detection (jti-tracking + invalidate-all-on-reuse).

### Nästa sprint

7. **M1** — Timing-constant requestOtp-svar.
8. **M4** — `Cache-Control: no-store` på alla API-svar.
9. **M5** — Rate limit på `/refresh` och `/me`.
10. **M6** — Exponera `POST /api/auth/logout-all`.
11. **M7** — Exponera fel-detaljer endast i development.

### Senare (defense-in-depth)

12. **M2** — Nyckel-versionering för `TOKEN_ENCRYPTION_KEY`.
13. **M3** — Extra skydd mot accidental OTP-logging.

---

## Verifiering

- `npm run test:api` — alla befintliga auth-tester ska fortfarande passera.
- `npm run test:e2e` — login-flödet (request → verify → me → logout) ska fungera end-to-end.
- Manuell test: försök brute-forca OTP-verifiering från flera IPs → ska blockeras på email-nivå.
- Manuell test: stjäl en refresh token, använd den, använd den igen → andra gången ska rensa alla sessioner.
- Manuell test: deploy med `NODE_ENV=production` men utan `FRONTEND_URL` → ska vägra starta.
- `docker logs` på entrypoint-output: säkerställ att inga URL-värden läcker.
- Kör `curl -H "Origin: https://attacker.com" -X POST https://<prod>/api/projects` → ska avvisas (403 från CSRF).
- Kontrollera `curl -i /api/projects` → headers inkluderar `Cache-Control: no-store`.

---

## Invaliderade rapporter (för spårbarhet)

Dessa dök upp i den automatiserade auditen men verifierades som fel:

- **"CSP/X-Frame-Options saknas"** — `apps/web/nginx.conf:7-12` har komplett uppsättning: CSP med `frame-ancestors 'none'`, X-Frame-Options DENY, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- **"Logout invaliderar inte sessionen"** — `authService.logout()` (`auth.service.ts:237-241`) kör `deleteMany({ where: { refreshToken } })`. En stulen token efter logout kan inte användas eftersom `refreshAccessToken` gör `findUnique({ refreshToken })` som returnerar null.
- **"Vite/esbuild CVE:er"** — `npm audit --audit-level=moderate --omit=dev` → 0 vulnerabilities. Vite är dev-only; prod serveras via nginx på statiska filer.
- **"Hårdkodade secrets i CI är kritiskt"** — Värden i `.github/workflows/ci.yml:60-88` används endast i GitHub Actions runner-miljö, aldrig i prod-deployment. Dessa secrets har inga prod-privilegier.
- **"userId-regex är bräcklig"** — `apps/api/src/lib/user-db.ts:13-19` validerar strikt, och `createUserDatabase` använder `execFileSync` (ingen shell), så command injection via userId är omöjligt även om regex skulle släppa igenom något.
- **"BOX-token migration saknar audit-log"** — Gäller endast en engångsmigration av legacy plaintext-tokens. När all data är migrerad är punkten irrelevant.
