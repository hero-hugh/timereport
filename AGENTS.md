# Tidrapporteringssystem - Agent Guide

## Projektöversikt

Ett modernt tidrapporteringssystem för att spåra arbetad tid på projekt och generera faktureringsunderlag.

### Tech Stack

| Del | Teknologi |
|-----|-----------|
| **Monorepo** | Turborepo |
| **Backend** | Hono (TypeScript) |
| **Frontend** | React + Vite + TypeScript |
| **UI** | Shadcn/ui + TailwindCSS |
| **Databas** | SQLite (dev) / PostgreSQL (prod) via Prisma |
| **Auth** | OTP via e-post, JWT i HTTP-only cookies |
| **Linting** | Biome |
| **Test** | Vitest |

### Projektstruktur

```
time-report/
├── apps/
│   ├── api/          # Hono backend
│   └── web/          # React frontend
├── packages/
│   └── shared/       # Delade typer och Zod-schemas
├── PLAN.md           # Detaljerad projektplan
├── AGENTS.md         # Denna fil
└── biome.json        # Linting-konfiguration
```

---

## Definition of Done (DoD)

En feature anses **INTE klar** förrän följande kriterier är uppfyllda:

### 1. Kod
- [ ] Koden kompilerar utan TypeScript-fel (`npx tsc --noEmit`)
- [ ] Koden passerar linting (`npm run lint`)
- [ ] Koden följer projektets struktur och mönster

### 2. Tester
- [ ] **Enhetstester finns** för all ny business logic
- [ ] **Alla tester passerar** (`npm run test`)
- [ ] Tester täcker:
  - Happy path (normalfall)
  - Edge cases (gränsfall)
  - Felhantering (error cases)

### 3. Backend-specifikt
- [ ] API-endpoints validerar input med Zod
- [ ] Felmeddelanden är användarvänliga (svenska)
- [ ] Autentisering/auktorisering är korrekt implementerad

### 4. Frontend-specifikt
- [ ] Komponenter är responsiva (mobile-first)
- [ ] Laddningstillstånd hanteras
- [ ] Felmeddelanden visas för användaren
- [ ] Formulär har validering

### 5. Dokumentation
- [ ] PLAN.md uppdaterad med implementation status
- [ ] Komplexa funktioner har kommentarer

---

## Kodkonventioner

### Allmänt
- **Språk i kod:** Engelska (variabelnamn, funktioner, kommentarer)
- **Språk i UI:** Svenska (felmeddelanden, labels, text)
- **Indentering:** Tabs (konfigurerat i Biome)
- **Quotes:** Single quotes för strings

### Backend (apps/api)
```typescript
// Services innehåller business logic
// src/services/example.service.ts
export class ExampleService {
  async doSomething(input: Input): Promise<Result> {
    // ...
  }
}
export const exampleService = new ExampleService()

// Routes hanterar HTTP, använder services
// src/routes/example.ts
import { exampleService } from '../services/example.service'

app.post('/example', async (c) => {
  const result = await exampleService.doSomething(input)
  return c.json({ success: true, data: result })
})
```

### Frontend (apps/web)
```typescript
// Komponenter i src/components/
// Feature-komponenter i src/components/features/
// UI-komponenter (Shadcn) i src/components/ui/

// Hooks i src/hooks/
// API-anrop i src/lib/api.ts
```

### Tester
```typescript
// Testfiler bredvid källkoden: example.test.ts
// Använd describe/it-struktur
describe('ServiceName', () => {
  describe('methodName', () => {
    it('should do something when condition', async () => {
      // Arrange
      // Act
      // Assert
    })
  })
})
```

---

## Viktiga mönster

### API-svar
Alla API-svar följer detta format:
```typescript
// Lyckat svar
{ success: true, data: T }

// Felaktigt svar
{ success: false, error: string }
```

### Autentisering
- Access token: 15 min livstid, skickas automatiskt via cookie
- Refresh token: 7 dagar, rotation vid varje användning
- OTP: 6 siffror, 10 min giltighetstid, max 5 försök

### Validering
- Zod-schemas definieras i `packages/shared/src/validation.ts`
- Typer exporteras från `packages/shared/src/types.ts`
- Backend validerar ALL input med dessa schemas

### Pengar
- Lagras i **ören** (integer) för att undvika floating point-problem
- Exempel: 850 kr = 85000 ören
- Konverteras vid visning i frontend

---

## Kommandon

```bash
# Utveckling
npm run dev:api          # Starta backend (port 3000)
npm run dev:web          # Starta frontend (port 5173)

# Databas
npm run db:push          # Synka Prisma-schema
npm run db:studio        # Öppna Prisma Studio

# Test & Lint
npm run test             # Kör alla tester
npm run test:api         # Kör backend-tester
npm run lint             # Kontrollera kod
npm run lint:fix         # Fixa lint-fel
```

---

## Checklista vid ny feature

1. [ ] Skapa/uppdatera Zod-schema i `packages/shared`
2. [ ] Implementera backend service + route
3. [ ] Skriv backend-tester
4. [ ] Implementera frontend-komponent
5. [ ] Testa manuellt (mobile + desktop)
6. [ ] Verifiera att alla tester passerar
7. [ ] Uppdatera PLAN.md
