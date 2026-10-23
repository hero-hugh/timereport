# Tidrapporteringssystem - Projektplan

## Översikt

**Mål:** Ett modernt tidrapporteringssystem med stöd för flera användare, projekthantering och faktureringsunderlag.

**Tech Stack:**
- **Frontend:** React + TypeScript + Vite + Shadcn/ui + TailwindCSS
- **Backend:** Hono (TypeScript)
- **Databas:** SQLite (dev) → PostgreSQL (prod) via Prisma ORM
- **Monorepo:** Turborepo
- **Autentisering:** OTP via e-post (passwordless), JWT i HTTP-only cookies

---

## Autentisering (OTP-flöde)

### Flöde:
1. Användare anger e-post
2. Backend genererar 6-siffrig OTP-kod (giltig i 10 min)
3. Koden printas i konsollen (e-postintegration senare)
4. Användare anger koden
5. Backend verifierar koden
6. Om användare inte finns → skapas automatiskt
7. JWT-tokens sätts som HTTP-only cookies
8. Användaren är inloggad

### Säkerhet:
- OTP-koder hashas i databasen
- Max 5 försök per e-post per 15 min (rate limiting)
- JWT access token: 15 min livstid
- JWT refresh token: 7 dagar livstid (HTTP-only cookie)
- Refresh token rotation vid varje användning
- CSRF-skydd via SameSite=Strict på cookies

---

## Datamodell

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  projects    Project[]
  timeEntries TimeEntry[]
  otpCodes    OtpCode[]
  sessions    Session[]
}

model OtpCode {
  id        String   @id @default(uuid())
  email     String
  codeHash  String
  expiresAt DateTime
  attempts  Int      @default(0)
  used      Boolean  @default(false)
  createdAt DateTime @default(now())

  @@index([email])
}

model Session {
  id           String   @id @default(uuid())
  userId       String
  refreshToken String   @unique
  expiresAt    DateTime
  createdAt    DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Project {
  id          String    @id @default(uuid())
  userId      String
  name        String
  description String?
  hourlyRate  Int?      // I ören (t.ex. 85000 = 850 kr)
  startDate   DateTime
  endDate     DateTime? // null = tills vidare
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  timeEntries TimeEntry[]
}

model TimeEntry {
  id          String   @id @default(uuid())
  projectId   String
  userId      String
  date        DateTime // Endast datum, ingen tid
  minutes     Int      // Tid i minuter
  description String?  // Valfri kommentar
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId, date]) // En entry per projekt/användare/dag
}
```

---

## Projektstruktur

```
time-report/
├── apps/
│   ├── web/                    # React frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ui/         # Shadcn komponenter
│   │   │   │   └── features/   # Feature-specifika komponenter
│   │   │   ├── pages/          # Sidkomponenter
│   │   │   ├── hooks/          # Custom hooks
│   │   │   ├── lib/            # API-client, utilities
│   │   │   └── main.tsx
│   │   └── vite.config.ts
│   │
│   └── api/                    # Hono backend
│       ├── src/
│       │   ├── index.ts        # Entry point
│       │   ├── routes/
│       │   │   ├── auth.ts
│       │   │   ├── projects.ts
│       │   │   ├── time-entries.ts
│       │   │   └── reports.ts
│       │   ├── middleware/
│       │   │   └── auth.ts
│       │   ├── services/
│       │   │   ├── auth.service.ts
│       │   │   ├── project.service.ts
│       │   │   └── time-entry.service.ts
│       │   └── lib/
│       │       ├── db.ts       # Prisma client
│       │       ├── jwt.ts
│       │       └── otp.ts
│       └── prisma/
│           └── schema.prisma
│
├── packages/
│   └── shared/                 # Delade typer och validering
│       └── src/
│           ├── types.ts
│           └── validation.ts   # Zod schemas
│
├── turbo.json
├── package.json
└── PLAN.md
```

---

## API-endpoints

### Auth
| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| POST | `/api/auth/request-otp` | Begär OTP-kod till e-post |
| POST | `/api/auth/verify-otp` | Verifiera OTP och logga in |
| POST | `/api/auth/refresh` | Förnya access token |
| POST | `/api/auth/logout` | Logga ut (rensa cookies) |
| GET | `/api/auth/me` | Hämta inloggad användare |

### Projekt
| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/api/projects` | Lista alla användarens projekt |
| POST | `/api/projects` | Skapa nytt projekt |
| GET | `/api/projects/:id` | Hämta specifikt projekt |
| PATCH | `/api/projects/:id` | Uppdatera projekt |
| DELETE | `/api/projects/:id` | Ta bort projekt |

### Tidrapportering
| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/api/time-entries` | Lista tidrapporter (med filter) |
| POST | `/api/time-entries` | Skapa/uppdatera tidrapport |
| DELETE | `/api/time-entries/:id` | Ta bort tidrapport |

Query params för GET: `?projectId=&from=&to=`

### Rapporter
| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/api/reports/summary` | Sammanställning av tid och belopp |

Query params: `?projectId=&from=&to=`

---

## Frontend-vyer (Mobile First)

### 1. Login (`/login`)
- E-post input
- OTP-verifiering (visas efter request)
- Redirect till dashboard vid success

### 2. Dashboard (`/`)
- Snabbstatistik: Total tid denna vecka/månad
- Lista: Aktiva projekt med snabbrapportering
- Quick-action: Rapportera tid för idag

### 3. Projekt (`/projects`)
- Lista alla projekt (kort-vy)
- Visa: namn, status (aktiv/avslutad), total tid, belopp
- Filtrera: aktiva/alla
- Skapa nytt projekt

### 4. Projekt-detalj (`/projects/:id`)
- Projektinfo (redigerbar)
- Sammanställning: total tid, belopp att fakturera
- Lista tidrapporter för projektet

### 5. Tidrapportering (`/time`)
- Veckokalender-vy (7 dagar)
- Visa rapporterad tid per dag och projekt
- Klicka för att lägga in/redigera tid
- Input: projekt, timmar:minuter, kommentar (valfri)

### 6. Rapporter (`/reports`)
- Välj period (denna månad, förra månaden, custom)
- Välj projekt (alla eller specifikt)
- Visa: Total tid, Belopp (kr)
- Breakdown per projekt

---

## Implementationsordning

### Fas 1: Projektsetup
- [x] Skapa plan
- [x] Initiera monorepo med Turborepo
- [x] Konfigurera Biome för linting/formatering
- [x] Sätta upp apps/api med Hono + TypeScript
- [x] Konfigurera Prisma med SQLite
- [x] Sätta upp packages/shared med Zod schemas

### Fas 2: Backend - Autentisering
- [x] Implementera OTP-generering och verifiering
- [x] Implementera JWT-hantering (access + refresh tokens)
- [x] Bygga auth routes
- [x] Bygga auth middleware

### Fas 3: Backend - Projekt & Tid
- [x] Bygga projekt API-endpoints
- [x] Bygga time-entry API-endpoints
- [x] Bygga reports API-endpoint
- [x] Skriva tester (57 tester passerar)

### Fas 4: Frontend Setup
- [x] Sätta upp apps/web med Vite + React + TypeScript
- [x] Konfigurera TailwindCSS med Shadcn-tema
- [x] Sätta upp routing och layout (mobile + desktop)

### Fas 5: Frontend - Auth & Projekt
- [x] Bygga Login-sida med OTP-flöde
- [x] Implementera auth context och protected routes
- [x] Bygga projektlista och projekt-formulär

### Fas 6: Frontend - Tidrapportering & Dashboard
- [x] Bygga tidrapporterings-vy (vecko-grid)
- [x] Bygga dashboard med statistik
- [x] Bygga rapport-sida

### Fas 7: Övrigt
- [x] API för svenska helgdagar (35 tester)
- [x] Skriva tester för frontend (84 tester passerar)

### Säkerhetsuppdatering 2026-10-23
- [x] Ersatt Node 20 med Node 22.23.4 i båda Dockerfilerna och CI/deploy. Lokal version väljs med `.nvmrc`; `engines` kräver minst 22.23.4 inom Node 22.
- [x] Installerat Node 22.23.4 lokalt via nvm och verifierat versionen i den byggda backend-containern.
- [x] Uppdaterat npm-lockfilens kompatibla säkerhetsfixar samt Vite till 6.4.5, Vitest till 4.1.12 och React Router till 7.18.4. Anpassat testkonfiguration och mockar till Vitest 4; lagt till saknad testuppgift i Turbo.
- [x] `npm audit --omit=dev`: 0 sårbarheter. Full `npm audit`: minskat från 28 (2 kritiska) till 8 (0 kritiska, 5 höga, 3 måttliga).
- [x] Verifierat ren `npm ci`, 270 tester (187 backend + 83 frontend), TypeScript/produktionsbygge och båda Dockerbyggena på Node 22.23.4.
- [ ] Åtgärda återstående byggberoenden: `braces`/`chokidar`/`micromatch`/`fast-glob` samt `postcss-selector-parser`/`postcss-nested` via Tailwind 3 och `tailwindcss-animate`. npm rapporterar ingen komplett tillgänglig fix; en separat Tailwind-migrering behöver utvärderas. Dessa paket ingår inte i produktionsberoendena enligt `npm audit --omit=dev`.
- [ ] Befintliga lintfel utanför säkerhetsändringen kvarstår. Ändrade kod- och konfigurationsfiler kontrolleras separat med Biome.
- [ ] Bygg om och driftsätt de uppdaterade bilderna; verifiera `node --version` i den körande backend-containern. Produktionsmiljön har inte ändrats eller inspekterats i denna kontroll.

Node-patchen åtgärdar bland annat Brotli RCE, CVE-2026-111497. Node 20 är EOL och får inte motsvarande säkerhetspatch. Se [Node.js säkerhetsrelease 2026-10-21](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) och [release 22.23.4](https://nodejs.org/en/blog/release/v22.23.4/). `npm audit` kontrollerar npm-beroenden, inte själva Node-runtime eller operativsystemets paket. Versionspinnarna behöver uppdateras vid kommande säkerhetsreleaser.

---

## Miljövariabler

### Backend (apps/api/.env)
```
DATABASE_URL="file:./dev.db"
JWT_SECRET="generate-a-secure-secret-min-32-chars"
JWT_REFRESH_SECRET="generate-another-secure-secret-min-32-chars"
FRONTEND_URL="http://localhost:5173"
```

### Frontend (apps/web/.env)
```
VITE_API_URL="http://localhost:3000"
```

---

## Kommandon

```bash
# Välj projektets patchade Node-version
nvm install
nvm use

# Installera dependencies
npm ci

# Starta utvecklingsservrar
npm run dev:api          # Backend på port 3000
npm run dev:web          # Frontend på port 5173

# Databas
npm run db:push          # Synka schema till databas
npm run db:studio        # Öppna Prisma Studio

# Tester
npm run test:api         # Kör backend-tester

# Linting
npm run lint             # Kör Biome lint
npm run lint:fix         # Fixa lint-fel automatiskt
```

---

## Status

**Backend: KLAR**
- Alla API-endpoints implementerade
- OTP-autentisering med JWT
- Svenska helgdagar API
- 92 tester passerar

**Frontend: KLAR**
- Alla sidor implementerade
- 84 tester passerar (utils, hooks, komponenter)
