# Säkerhetsaudit — time-report

Granskad 2026-10-23 mot commit `0cb1703`. Fokus: dataläckage, nycklar, sessionssäkerhet, åtkomst mellan användare och åtkomst till interna system.

Detta är en granskning med lokala verifieringar, inte ett intyg om produktionsmiljön. Inga produktionsanrop, riktiga inloggningar eller BOX-anrop har utförts. Ursprungliga fynd och verifieringar finns kvar nedan; efterföljande kodåtgärder redovisas separat här.

## Åtgärdsstatus 2026-10-23

Kodfixar för A1–A6 har implementerats ovanpå `c314a7e` och verifierats lokalt. De är ännu inte verifierade i produktionsmiljön.

| ID | Implementerad ändring | Regressionstest |
|---|---|---|
| A1 | Rekursiva Docker-undantag för miljöfiler, databaser, nyckelfiler, data och byggartefakter. API-bygget kopierar specificerade källfiler/schemas och genererar alla Prisma-klienter. | Båda byggimages och båda produktionsimages byggda med syntetiska `.env.local`, `auth.db`, `auth.db-wal` och `private.key` i undermappar; inga förbjudna applikationsfiler hittades. Samma kontroll tillagd i CI. |
| A2 | Endast SHA-256-digest av refresh-token lagras. Grace-flödet återskapar vinnande token med signerarnyckeln, sessionens ID, jti och fasta giltighetstid. Äldre klartextsessioner raderas före serverstart. | Inloggning och rotation lagrar digest; parallella anrop återfår samma token utan klartextlagring. Uppgraderingsrensningen är idempotent och bevarar nya sessioner. |
| A3 | JWT innehåller sessions-ID. Middleware kräver en existerande, giltig session för samma användare. Ny autentiserad `POST /api/auth/logout-all`. | Logout, logout-all och upptäckt token-reuse ger 401 med tidigare access-token. Andra användare behåller åtkomst. Sessions-ID från en annan användare nekas. |
| A4 | OTP konsumeras villkorat och atomärt; felräknaren ökas atomärt. Refresh-rotation använder villkorad uppdatering av aktuell jti och digest. | Åtta parallella korrekta OTP-anrop ger en session. Parallella felgissningar når försöksgränsen. Åtta refresh-anrop får en gemensam ny token; återanvändning utanför grace återkallar sessionerna. |
| A5 | BOX-klienten kastar fasta felkategorier och behåller inte råa upstream-meddelanden, svarskroppar eller nätverksfel. Routes returnerar svenska standardmeddelanden och loggar kategorier. | Syntetisk hemlighet/intern adress i GraphQL-fel når varken API-svar eller route-logg. HTTP-, nätverks- och JSON-fel maskeras. |
| A6 | Entrypoint avbryter vid ägarskapsfel, misslyckad behörighetssänkning eller icke skrivbar datakatalog. `umask 077` skyddar nya databasfiler. | Riktig containerstart ger frisk health-route, Node som UID 1001 och auth.db med behörighet 600. Skrivskyddad katalog och blockerad setuid avbryter före Prisma/Node. Samma kontroll tillagd i CI. |

Verifiering: 206 backendtester och 83 frontendtester passerar, liksom alla 5 E2E-tester i en separat kopia med testdatabaser. TypeScript och produktionsbyggen passerar. Ändrade TypeScript-filer passerar Biome. Projektets fulla lint har fortfarande 22 befintliga fel utanför ändringen.

### Vid driftsättning

- **Användare behöver logga in igen vid första uppgraderingen.** Gamla token saknar sessionsbindning och godtas inte; äldre klartextsessioner tas bort före API:t börjar ta emot anrop. Användare, projekt, tider och BOX-inställningar påverkas inte av denna rensning.
- Prisma-fältet heter nu `refreshTokenHash` men använder `@map("refreshToken")`. Den fysiska kolumnen och dess index behålls; ingen destruktiv schemaändring behövs. Generera klienterna med `npm run db:generate:all`. Kör inte gammal och ny API-version parallellt mot samma auth-databas.
- Bygg och driftsätt nya images. Bekräfta health, faktisk process-UID och inloggning/utloggning i drift. Detta har bara verifierats lokalt med syntetiska testdata.
- Inventera tidigare publicerade images, byggcache och backuper. Nya Docker-undantag rensar inte gamla kopior, och radborttagning garanterar inte fysisk radering ur SQLite-filer eller backuper. Återkalla/rotera berörda sessioner och nycklar om känsligt material har publicerats. Inga sådana externa raderingar eller rotationer har utförts här.
- Kontrollerna av image-filsystemet avser applikationskataloger och utesluter `node_modules`. De ersätter inte en secretscanner för godtyckliga filnamn, lagerhistorik eller en sårbarhetsskanning av OS-paket. Rapporterade driftosäkerheter och övriga förstärkningar nedan, inklusive OTP-hashens lilla sökutrymme, kvarstår.

## Ursprunglig bedömning

Prioritera Docker-byggkontexten och sessionslagringen. Den lokalt byggda backend-imagen innehåller databasfiler. Refresh-token lagras samtidigt som direkt återanvändbara bearer-token i auth-databasen. Kombinationen kan göra en image- eller backup-läcka till kontoövertagande om giltiga produktionssessioner finns i materialet.

Jag har inte hittat en verifierad väg för en oautentiserad besökare att läsa andra användares projekt eller hämta BOX-token. De lokala kontrollerna av användarisolering gav förväntade 401/404-svar. Det utesluter inte andra sårbarheter.

| ID | Prioritet | Fynd | Verifiering |
|---|---|---|---|
| A1 | Hög | Databasfiler följer med i backend-image | Inspektion av lokal image |
| A2 | Hög vid DB-/backupläcka | Refresh-token lagras i återanvändbar klartext | Kod + isolerat databastest |
| A3 | Medel | Återkallade sessioner stoppar inte redan utfärdade access-token | Isolerat test: HTTP 200 efter logoutAll |
| A4 | Medel | OTP-förbrukning och refresh-rotation är inte atomära | Två lyckade samtidiga anrop |
| A5 | Medel | Interna BOX-fel returneras ofiltrerade till användaren | Syntetiskt upstream-fel återkom i svaret |
| A6 | Medel, villkorad | Backend fortsätter som root om behörighetssänkningen misslyckas | Kodgranskning |

## A1 — Databaser i Docker-image

**Platser:** `.dockerignore:5–8`, `Dockerfile.api:13`, `Dockerfile.api:53`.

Undantagen `.env`, `.env.*` och `*.db` täcker inte motsvarande filer i alla undermappar. Backendbygget kopierar hela `apps/api/` och runtime-steget kopierar hela Prisma-katalogen från buildern.

**Bekräftat:** imagen `time-report-api:security-check`, som byggdes lokalt i föregående säkerhetsuppdatering, innehåller bland annat `apps/api/prisma/central/data/auth.db`, en testdatabas och databaser under `apps/api/prisma/user/data/`. Endast filnamnen inspekterades, inte databasernas innehåll. Samma brist i undantagen kan föra in lokala `.env`-filer i builderlagren, även om de inte kopieras till slutimagen.

**Konsekvens:** den som kan ladda ner en berörd image får också de inbakade databaserna. Att radera filer i ett senare lager tar inte bort dem ur tidigare lager. Buildercache kan innehålla hemligheter även när runtime-imagen inte gör det.

**Avgränsning:** den publicerade GHCR-imagen och den körande produktionscontainern har inte inspekterats. Deploy-workflowens build-jobb gör en separat checkout; testdatabaser från test-jobbet förs inte automatiskt över dit. Den lokala observationen bevisar därför inte en produktionsläcka.

**Åtgärd:** använd rekursiva undantag för `.env*`, `*.db*`, SQLite-filer, data-/backupkataloger, `node_modules`, genererade klienter och byggartefakter. Kopiera bara nödvändiga schemas och migrationsfiler till runtime. Lägg till en CI-kontroll av imagen som avvisar miljöfiler och databaser. Kontrollera tidigare publicerade images och byggcache; återkalla sessioner eller rotera berörda nycklar om känsligt material faktiskt har publicerats.

## A2 — Återanvändbara refresh-token i auth-databasen

**Platser:** `apps/api/src/services/auth.service.ts:223–228`, `:294`, `:331–339`; `apps/api/prisma/central/schema.prisma`, modellen `Session`.

Hela refresh-token sparas i `Session.refreshToken`. Tokenen kan användas direkt för att hämta nya access-token utan tillgång till JWT-signeringsnyckeln. Grace-flödet läser dessutom tokenen ur databasen och skickar tillbaka den.

**Bekräftat:** i den isolerade testdatabasen var det lagrade värdet identiskt med den token som utfärdades vid inloggning.

**Konsekvens:** läsbehörighet till en auth-databas, backup eller berörd image kan ge åtkomst till användarkonton så länge sessionerna är giltiga. Detta förutsätter ett sådant läckage; någon anonym databasläsningsendpoint har inte hittats.

**Åtgärd:** lagra en envägshash av refresh-token och jämför mot den vid användning. Anpassa grace-flödet så att det inte kräver beständig lagring av en återanvändbar token i klartext. Om återutsändning är nödvändig behövs en separat, kortlivad och skyddad lösning. Säkerställ backupskydd och sessionsåterkallelse.

OTP använder också en snabb, okrypterad SHA-256-hash av bara sex siffror (`lib/otp.ts:30–31`). Vid DB-läcka är det lilla kodutrymmet möjligt att söka igenom offline. En separat serverhemlighet för HMAC skulle ge skydd mot enbart databasläsning.

## A3 — Access-token fungerar efter återkallelse

**Platser:** `apps/api/src/middleware/auth.ts:29–44`, `apps/api/src/lib/jwt.ts:4`, `apps/api/src/services/auth.service.ts:353–365`.

`requireAuth` verifierar JWT-signaturen och giltighetstiden men kontrollerar ingen aktiv session eller återkallelseversion. Logout, logoutAll och upptäckt refresh-reuse raderar sessioner men påverkar inte redan utfärdade access-token.

**Bekräftat:** efter att samtliga sessioner tagits bort gav samma access-token HTTP 200 på en route med den riktiga auth-middlewaren. Maximal återstående giltighetstid är cirka 15 minuter.

**Konsekvens:** en angripare som redan har en access-token kan fortsätta läsa eller ändra data trots utloggning eller säkerhetsvarning. Rate limit på 300 anrop/minut förhindrar inte en sådan dataexport.

**Åtgärd:** koppla access-token till en session eller användarens återkallelseversion och kontrollera den i middlewaren. Exponera en autentiserad funktion för att avsluta alla sessioner. Om 15 minuters fördröjd återkallelse medvetet accepteras måste UI och incidenthantering beskriva detta korrekt.

## A4 — Samtidiga anrop kringgår engångssemantik

**Platser:** `apps/api/src/services/auth.service.ts:130–184`, `:265–269`, `:331–341`.

OTP läses först som oanvänd och markeras senare använd med en ovillkorlig uppdatering på ID. Två anrop kan läsa samma tillstånd och båda skapa sessioner. Felräknaren skriver också ett beräknat värde i stället för en atomär ökning. Refresh-rotation uppdaterar sessionen på ID utan krav på att den gamla jti:n fortfarande är aktuell.

**Bekräftat med riktiga Prisma-operationer i separat SQLite-databas:**

- Två parallella verifieringar av samma korrekta OTP lyckades båda.
- Två parallella refresh-anrop lyckades och utfärdade två olika nya refresh-token.

OTP-testet förutsätter att den korrekta koden är känd. Det demonstrerar inte inloggning utan giltig kod. Refresh-racet kan även ge felaktig reuse-detektering och utloggning av legitima användare.

**Åtgärd:** konsumera OTP med en villkorad, atomär uppdatering av `used=false`, giltighet och försöksgräns, och kräv exakt en uppdaterad rad. Gör räknarökning atomär. Rotera refresh med compare-and-swap på tidigare jti och hantera förlorande anrop genom det avsedda grace-flödet. Lägg till regressionstester för samtidiga anrop.

## A5 — BOX-fel läcker upstream-detaljer

**Platser:** `apps/api/src/lib/box-client.ts:104–107`, `apps/api/src/routes/box-sync.ts:20–31`, `:165`, `:192`, `:242`.

GraphQL-fel blir `BoxApiError(message)`. Om meddelandet inte matchar några få specialfall returneras det oförändrat till frontend och loggas. Produktionsmiljöns generiska felhanterare hjälper inte eftersom routen redan har fångat felet.

**Bekräftat:** ett syntetiskt BOX-svar med en intern värd och ett syntetiskt hemlighetsfält återkom i API-svaret. Inga riktiga BOX-anrop gjordes och inget faktiskt upstream-hemlighetsläckage har observerats.

**Konsekvens:** interna sökvägar, databas-/GraphQL-detaljer eller hemligheter som upstream råkar inkludera kan nå användaren och applikationsloggarna.

**Åtgärd:** mappa godkända felkategorier till fasta svenska meddelanden. Returnera ett neutralt fel-ID för övriga fel och använd strukturerad, redigerad loggning utan råa upstream-meddelanden.

## A6 — Servern kan köras som root vid volymfel

**Plats:** `docker/api-entrypoint.sh:38–53`.

Om skrivkontrollen som användaren `app` misslyckas fortsätter skriptet till Prisma och Node som root. Detta kan inträffa när en volym har fel ägare eller behörigheter.

**Konsekvens:** vid en separat applikationssårbarhet blir konsekvenserna större eftersom processen får rootbehörighet i containern. Detta är inte i sig ett bevis för containerflykt eller åtkomst till värdmaskinen.

**Åtgärd:** avbryt starten om ägarskap eller behörighetssänkning misslyckas. Förbered volymbehörigheter och kör om möjligt alltid applikationen med en fast oprivilegierad användare. Begränsa nätverksåtkomst och monteringar i drift.

## Övriga kontroller och kvarvarande osäkerheter

- **Registrering:** alla som verifierar sin e-post kan skapa konto (`auth.service.ts:190–198`). Ingen allowlist eller inbjudan krävs. Detta ger en egen databas, inte automatiskt åtkomst till andras data. Om tjänsten ska vara privat behövs ett uttryckligt registreringsskydd. Avsikten är ännu inte fastställd i denna granskning.
- **Proxyförtroende:** `getClientIp` förutsätter att CapRovers nginx skriver över `X-Real-IP`. Med `TRUST_CLOUDFLARE_HEADERS=true` måste origin dessutom vara begränsad till betrodd trafik. Annars kan klientstyrda headers påverka rate limit. Faktisk proxy-/brandväggskonfiguration har inte verifierats.
- **Interna system:** BOX-adressen är fast, inte användarstyrd. Ingen generell URL-fetch, filserver eller shell-endpoint hittades. Däremot har containerns utgående nätverk, Docker-nätverk, värdmonteringar och åtkomst till CapRover-/interna adminsystem inte verifierats. Egress bör begränsas till nödvändiga tjänster.
- **Nycklar:** BOX-token krypteras med AES-256-GCM och slumpmässig IV. Nyckelrotation/key-ID saknas och legacy-token migreras först när sync används. Eventuella gamla klartextvärden och backuper behöver inventeras utan att logga tokenvärden.
- **Loggar:** Hono loggar full sökväg inklusive query-parametrar. Nuvarande auth-token och BOX-token skickas i cookies/header/body, inte URL. Undvik att lägga framtida hemligheter i URL och redigera fel innan loggning.
- **Nginx:** statiska assets har egen `add_header Cache-Control`, vilket bryter arv av säkerhetsheaders från serverblocket. Det gäller assets, inte SPA-dokumentets CSP. Lägg gemensamma headers även där eller konfigurera explicit arv om nginx-versionen stödjer det. Detta är förstärkning, inte en verifierad XSS. Se [nginx headers-dokumentation](https://nginx.org/en/docs/http/ngx_http_headers_module.html).
- **Deploy:** GitHub Actions använder CapRovers adminlösenord. Kompromettering av deploy-jobbet kan därför påverka fler appar än denna. Utvärdera appspecifik deploy-token och skyddad deployment environment. Faktiska GitHub-/CapRover-behörigheter är inte verifierade.
- **Tillgänglighet:** `/auth/refresh` och `/auth/me` saknar egen rate limit; BOX-anrop saknar explicit timeout. Dessa är främst tillgänglighetsrisker och har inte lasttestats.

## Skydd som verifierats eller granskats

- Lokala API-test gav 401 utan autentisering och 404 när användare B försökte läsa eller radera användare A:s projekt med känt ID.
- Databasval kommer från signerad token, inte request-body. userId valideras före filvägsanvändning och Prisma startas med `execFileSync`, utan shellinterpolering.
- `/auth/me` och profiluppdatering använder explicit fälturval. BOX-token-endpointen returnerar bara `hasToken`.
- Frontend lagrar inte sessionstoken i localStorage/sessionStorage. BOX-inmatningen töms efter lyckad lagring.
- Cookies är HttpOnly/Secure/SameSite=Strict i produktion. CORS tillåter en specifik frontend-origin. CSRF-middleware är installerad; dess kontroller gäller formulärkompatibla content-types och JSON skyddas dessutom av browserns preflight/CORS. Det är inte korrekt att beskriva den som en ovillkorlig Origin-kontroll på alla requests.
- API-svar under `/api/*` har no-store-middleware. Produktionsfel från den generella felhanteraren maskeras. Health-routen registreras före no-store men innehåller bara status/tid.
- Inga tydliga `dangerouslySetInnerHTML`-/eval-sänkor eller användarstyrda SQL-fragment hittades i applikationsflödena.
- Mönsterbaserad secretsökning omfattade 127 spårade filer och 333 textblobbar i lokal Git-historik. Träffarna som granskades var placeholders/testvärden. Inga verifierade riktiga nycklar hittades. Sökningen ersätter inte en komplett secretscanner eller kontroll av registry, CI-loggar, backuper och produktionsmiljö.
- Föregående beroendeaudit av samma säkerhetsuppdatering gav 0 produktionsfynd och 8 kvarvarande fynd i utvecklings-/byggberoenden. Denna granskning är inte en ny CVE-/OS-paketskanning.

Sessionsåtgärderna följer principen om serverstyrd återkallelse och skydd av sessionshemligheter i [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Rekommenderad åtgärdsordning

1. Stoppa oavsiktlig inbakning av data/nycklar i images och inventera publicerade images och cache.
2. Skydda refresh-token i lagring och gör sessionsåterkallelse verksam även för access-token.
3. Gör OTP-konsumtion och refresh-rotation atomära, med tester för samtidighet.
4. Maskera BOX-fel och avbryt starten om servern inte kan köras oprivilegierat.
5. Fastställ registreringspolicy och verifiera driftens proxyförtroende, nätverksisolering, registry-/backupåtkomst och deploybehörigheter.

Det ursprungliga verifieringsskriptet kördes med syntetiska användare och separata temporära databaser; inga produktionshemligheter har skrivits i rapporten. Åtgärder efter audit-tillfället och deras verifiering redovisas i åtgärdsstatusen ovan.
