// Färdiga mallar baserade på Starwebs guide
// "Guide for Creating | Updating Simple Product in Starweb Using Starweb API" (2024-10-21).
// {productId}, {variantId} m.fl. i path fylls från variabler. {{namn}} kan användas i body.
window.STARWEB_TEMPLATES = [
  {
    group: '1. Hämta beroenden',
    items: [
      { name: 'Hämta tillverkare', method: 'GET', path: '/product-manufacturers', note: 'Notera manufacturerId att använda i produkt-payloaden.' },
      { name: 'Hämta lagerstatusar', method: 'GET', path: '/product-stock-statuses', note: 'Notera stockStatusId att använda i variant-payloaden.' },
      { name: 'Hämta enheter', method: 'GET', path: '/product-units', note: 'Notera unitId. Sätt bara unitId om produkten har en icke-standard enhet.' },
      { name: 'Hämta prislistor', method: 'GET', path: '/pricelists', note: 'Notera pricelistId. Standardprislistan har ID 1.' },
    ],
  },
  {
    group: '2. Skapa beroenden (vid behov)',
    items: [
      {
        name: 'Skapa tillverkare', method: 'POST', path: '/product-manufacturers',
        note: 'name är obligatoriskt och måste vara unikt.',
        body: { name: 'Example Ltd.', externalId: '101', externalIdType: 'external erp', url: 'https://example.net' },
      },
      {
        name: 'Skapa lagerstatus', method: 'POST', path: '/product-stock-statuses',
        note: 'languages måste ha minst ett språk. stockoutNewStatusId = status som sätts när varan tar slut.',
        body: { sortIndex: 0, stockoutNewStatusId: null, productBuyable: false, inStock: true, languages: [{ langCode: 'sv', name: 'My stock status' }] },
      },
      {
        name: 'Skapa enhet', method: 'POST', path: '/product-units',
        note: 'languages (langCode, name, symbol) är obligatoriskt.',
        body: { externalId: '101', externalIdType: 'external erp', languages: [{ langCode: 'sv', name: 'Pieces', symbol: 'pcs.' }] },
      },
      {
        name: 'Skapa prislista', method: 'POST', path: '/pricelists',
        note: 'Använd region "selected" + countryCodes (kommaseparerat). Skapa gärna med isActive=false, uppdatera priser, aktivera sedan – vid aktivering nollställs länkade priser.',
        body: {
          name: 'My unique pricelist', currencyCode: 'SEK', externalId: '123', externalIdType: 'External System',
          isActive: false, region: 'selected', countryCodes: 'SE,DK', pricesInclVatByDefault: false, inputAdminProductPricesInclVat: true,
        },
      },
    ],
  },
  {
    group: '3. Skapa produkt',
    items: [
      {
        name: 'Skapa produkt – alla rekommenderade fält', method: 'POST', path: '/products',
        note: 'Scenario 1. Notera productId och variantId i svaret (fångas automatiskt som variabler). sku måste vara unik.',
        body: {
          externalId: '123456', externalIdType: 'External System', createdAt: '2024-10-10T09:21:58+02:00',
          defaultVatRate: 25, visibility: 'visible', visibilityPricelistIds: null, manufacturerId: 1, unitId: 1, type: 'basic',
          variants: [{
            sku: 'sku123456', externalId: '123456', externalIdType: 'External System', isActive: true,
            stockStatusId: 1, stockQuantity: 100, weightInKg: 0.15, costPrice: 10.2, ean: '1234567890123',
            prices: [{ pricelistId: 1, priceExVat: 15.2, specialPriceExVat: null }],
          }],
          vatRates: [{ countryCode: 'GB', vatRate: 20 }],
          languages: [
            { langCode: 'sv', name: 'Produktnamn', shortDescription: 'Produkt kort beskrivning', longDescription: 'Produkt lång beskrivning' },
            { langCode: 'en', name: 'Product name', shortDescription: 'Product short description', longDescription: 'Product long description' },
          ],
        },
      },
      {
        name: 'Skapa produkt – minimum', method: 'POST', path: '/products',
        note: 'Scenario 2 – minsta rekommenderade fält. visibility "hidden" tills produkten är klar att publiceras.',
        body: {
          externalId: '123456', externalIdType: 'External System', defaultVatRate: 25, visibility: 'hidden',
          manufacturerId: 1, unitId: 1, type: 'basic',
          variants: [{ sku: 'sku12345678', stockStatusId: 1, stockQuantity: 100, weightInKg: 0.15, costPrice: 10.2, ean: '1234567890123', prices: [{ pricelistId: 1, priceExVat: 15.2 }] }],
          languages: [{ langCode: 'sv', name: 'Produktnamn' }],
        },
      },
    ],
  },
  {
    group: '4. Uppdatera produkt',
    items: [
      {
        name: 'Uppdatera produkt – ändra språk (PATCH)', method: 'PATCH', path: '/products/{productId}',
        note: 'Scenario 2 (rekommenderat): skicka bara fälten som ändras. PATCH på produkt uppdaterar inte varianter.',
        body: { languages: [{ langCode: 'sv', name: 'Produktnamn', shortDescription: 'Produkt kort beskrivning', longDescription: 'Produkt lång beskrivning' }] },
      },
      {
        name: 'Uppdatera produkt – lägg till språk (PATCH)', method: 'PATCH', path: '/products/{productId}',
        note: 'Scenario 3: lägg till nytt språk med partiell payload.',
        body: { languages: [{ langCode: 'de', name: 'Produktname', shortDescription: 'Produkt Kurzbeschreibung', longDescription: 'Produkt Langbeschreibung' }] },
      },
      { name: 'Hämta produktens varianter', method: 'GET', path: '/products/{productId}/variants', note: 'Notera variantId för varianten som ska uppdateras.' },
      {
        name: 'Uppdatera variant (PATCH)', method: 'PATCH', path: '/products/{productId}/variants/{variantId}',
        note: 'sku måste vara unik (annars HTTP 400). Ange max ett pris per prislista.',
        body: {
          sku: 'sku123456', externalId: '123456', externalIdType: 'External System: New Value', isActive: true,
          stockStatusId: 1, stockQuantity: 100, weightInKg: 0.15, costPrice: 10.2, ean: '1234567890123',
          prices: [{ pricelistId: 1, priceExVat: 15.2, specialPriceExVat: null }],
        },
      },
    ],
  },
  {
    group: '5. Volympriser (trappa)',
    items: [
      {
        name: 'Lista volympriser', method: 'GET', path: '/products/{productId}/variants/{variantId}/prices/{pricelistId}/volume',
        defaults: { pricelistId: '1' },
        note: 'Visar alla prissteg för varianten i vald prislista (pricelistId 1 = standardprislistan).',
      },
      {
        name: 'Skapa steg: från 10 st', method: 'POST', path: '/products/{productId}/variants/{variantId}/prices/{pricelistId}/volume',
        defaults: { pricelistId: '1' },
        note: 'Ett anrop per steg. priceExVat är styckpris EXKL. moms och gäller från quantity st (minst 2). 100 kr inkl. 25 % moms = 80 exkl.',
        body: { quantity: 10, priceExVat: 100, externalId: 'ART123-10', externalIdType: 'ERP' },
      },
      {
        name: 'Skapa steg: från 30 st', method: 'POST', path: '/products/{productId}/variants/{variantId}/prices/{pricelistId}/volume',
        defaults: { pricelistId: '1' },
        note: 'Andra steget. Ordinarie priceExVat på prislistan gäller för 1–9 st.',
        body: { quantity: 30, priceExVat: 80, externalId: 'ART123-30', externalIdType: 'ERP' },
      },
      {
        name: 'Ändra steg 30 st (PATCH)', method: 'PATCH', path: '/products/{productId}/variants/{variantId}/prices/{pricelistId}/volume/30',
        defaults: { pricelistId: '1' },
        note: 'Steget identifieras av antalet i sökvägen (/volume/30). Byt siffran för att ändra ett annat steg.',
        body: { priceExVat: 75 },
      },
      {
        name: 'Ta bort steg 30 st', method: 'DELETE', path: '/products/{productId}/variants/{variantId}/prices/{pricelistId}/volume/30',
        defaults: { pricelistId: '1' },
        note: 'Tar bort prissteget för 30 st. Byt siffran i sökvägen för ett annat steg.',
      },
      {
        name: 'Sätt pris + alla steg i ett anrop (PATCH)', method: 'PATCH', path: '/products/{productId}/variants/{variantId}/prices/{pricelistId}',
        defaults: { pricelistId: '1' },
        note: 'OBS: specen säger inte om volumePrices ersätter befintliga steg eller läggs till. Testa på en testartikel och kontrollera med "Lista volympriser".',
        body: { pricelistId: 1, priceExVat: 120, volumePrices: [{ quantity: 10, priceExVat: 100 }, { quantity: 30, priceExVat: 80 }] },
      },
    ],
  },
];
