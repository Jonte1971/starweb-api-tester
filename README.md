# Starweb API Tester

Lokal webbapp för att testa anrop mot [Starwebs Shop API v2](https://api-docs.starweb.se/).
Endpoints, parametrar och exempel-bodies läses direkt från Starwebs OpenAPI-spec, så listan hålls automatiskt uppdaterad.

## Kom igång

1. Kräver **Node.js 18+** (inga npm-paket behövs).
2. (Valfritt) Kopiera `.env.example` till `.env` och fyll i Shop ID, Client ID och Client Secret.
3. Starta i VS Code med **F5** (”Starta Starweb API Tester”) – webbläsaren öppnas automatiskt.
   Eller i terminalen: `npm start` och öppna http://localhost:3000

## Användning

- **Anslutning:** Fyll i Shop ID (eller hel Base URL), Client ID och Client Secret → *Hämta token*.
  Token hämtas via `POST /token` (client credentials) och förnyas automatiskt när den går ut.
- **Endpoints:** Välj i listan till vänster (grupperat per tagg, sökbart). Fyll i path/query-parametrar.
- **Body:** För POST/PUT/PATCH fylls ett exempel i från schemat – redigera och skicka.
- **Mallar:** Färdiga anrop från Starwebs guide för enkla produkter – hämta/skapa tillverkare, lagerstatus,
  enhet och prislista, skapa produkt (fullständig/minimum), uppdatera produkt och variant med PATCH.
- **Variabler:** `productId`, `variantId`, `manufacturerId` m.fl. fångas automatiskt från svaren och fylls i
  path-parametrar (`{productId}`). I body/query kan du skriva `{{productId}}`.
- **Fritt anrop:** Skriv valfri metod och sökväg, t.ex. `/products?page=2&include=primaryVariant`.
- **Historik:** De 50 senaste anropen sparas i webbläsaren och kan återställas med ett klick.

## Hur det fungerar

`server.js` serverar gränssnittet och agerar proxy mot `https://{shopId}.starwebserver.se/api/v2`
(undviker CORS). Proxyn lyssnar bara på `127.0.0.1` och vidarebefordrar endast till Starweb-domäner.
Client Secret sparas aldrig i webbläsaren – lägg den i `.env` om du inte vill skriva in den varje gång.

> Tänk på att POST/PUT/PATCH/DELETE ändrar riktig data i butiken. Använd gärna en testbutik.
