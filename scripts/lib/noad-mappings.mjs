/**
 * The government-workbook sheet mappings — source of truth for what the Excel
 * generator fills. scripts/provision-excel-templates.mjs uploads these into
 * Supabase (excel_templates.sheets); tests/noad-mapping.test.mjs verifies
 * every mapped cell against the real workbook's labels and validation lists.
 *
 * Layout rule for the single-value sheets, verified against the workbook:
 * the label sits on row N and its input on row N+1 ("*Name" at B4 is filled
 * at B5).
 *
 * Only fields we genuinely hold are mapped. Guessing at a Coast Guard notice
 * is the failure mode this project exists to remove — genuinely unknown
 * cells are listed in `unfilledRequired`, by exact address.
 */

import { buildCountryNameMap, buildCountryCodeMap } from './countries.mjs';

export const COUNTRY_NVMC = buildCountryNameMap('nvmc');
export const COUNTRY_SAILCLEAR = buildCountryNameMap('sailclear');
export const COUNTRY_CODE = buildCountryCodeMap();

// EO 14168: NVMC renamed Gender to Sex and accepts only these two.
export const SEX = { M: 'Male', F: 'Female', m: 'Male', f: 'Female', Male: 'Male', Female: 'Female' };

// SailClear's TravelDocumentType vocabulary is Passport | ID Card | Seaman Passport.
export const DOC_TYPE_SAILCLEAR = {
  passport: 'Passport',
  Passport: 'Passport',
  'passport card': 'ID Card',
  'Passport Card': 'ID Card',
};

/**
 * NVMC NOAD Workbook 8.2 — Non-Crew List.
 * Header row 6, data from row 8. Column letters verified against the workbook.
 */
const nvmcNonCrew = {
  sheetName: 'Non-Crew List',
  startRow: 8,
  dataType: 'travelers',
  columns: [
    { col: 'C', source: 'traveler.lastName', required: true },
    { col: 'D', source: 'traveler.firstName', required: true },
    { col: 'E', source: 'traveler.middleName' },
    { col: 'F', source: 'traveler.dateOfBirth', format: 'YYYY-MM-DD', required: true },
    { col: 'G', source: 'traveler.gender', valueMap: SEX, required: true },
    { col: 'H', source: 'traveler.nationality', normalize: 'country', valueMap: COUNTRY_NVMC, required: true },
    // I is NATIONALITY_CODE: a VLOOKUP whose cached value is empty in the blank
    // template, so it is resolved here and written as a literal.
    { col: 'I', source: 'traveler.nationality', normalize: 'country', valueMap: COUNTRY_CODE },
    // J/K Country of Residence are required by NVMC but appear on no passport.
    // Deliberately left unmapped so the field is visibly missing rather than
    // confidently wrong. See the report printed at the end of the provision run.
    { col: 'L', constant: 'Passport' },
    { col: 'M', source: 'traveler.passportNumber', required: true },
    { col: 'N', source: 'traveler.issuingAuthority', normalize: 'country', valueMap: COUNTRY_NVMC, required: true },
    { col: 'O', source: 'traveler.issuingAuthority', normalize: 'country', valueMap: COUNTRY_CODE },
    { col: 'P', source: 'traveler.dateOfExpiry', format: 'YYYY-MM-DD' },
    // W..AC is the Embark block, also required and also not on a passport.
  ],
};

/** NVMC Crew List — captain lands in the first row. */
const nvmcCrew = {
  sheetName: 'Crew List',
  startRow: 8,
  dataType: 'crew',
  columns: [
    { col: 'E', source: 'crew.lastName', required: true },
    { col: 'F', source: 'crew.firstName', required: true },
    { col: 'G', source: 'crew.middleName' },
    { col: 'H', source: 'crew.dateOfBirth', format: 'YYYY-MM-DD', required: true },
    { col: 'I', source: 'crew.gender', valueMap: SEX },
    { col: 'J', source: 'crew.nationality', normalize: 'country', valueMap: COUNTRY_NVMC, required: true },
    { col: 'K', source: 'crew.nationality', normalize: 'country', valueMap: COUNTRY_CODE },
    { col: 'N', constant: 'Passport' },
    { col: 'O', source: 'crew.passportNumber', required: true },
  ],
};

/**
 * SailClear Individual_Format.xlsx.
 * Worksheet must be named exactly "Individuals"; headers row 1, data from row 2.
 */
const sailclearIndividuals = {
  sheetName: 'Individuals',
  startRow: 2,
  dataType: 'travelers',
  columns: [
    { col: 'A', source: 'traveler.firstName', required: true },
    { col: 'B', source: 'traveler.lastName', required: true },
    { col: 'C', source: 'traveler.middleName' },
    { col: 'D', source: 'traveler.gender', valueMap: SEX, required: true },
    { col: 'E', source: 'traveler.nationality', normalize: 'country', valueMap: COUNTRY_SAILCLEAR, required: true },
    { col: 'F', source: 'traveler.dateOfBirth', format: 'MM-DD-YYYY', required: true },
    // Passports usually print a city here. Routed through the country map so a
    // country resolves and a city falls through and is rejected on upload,
    // rather than being silently accepted as a country.
    { col: 'G', source: 'traveler.placeOfBirth', normalize: 'country', valueMap: COUNTRY_SAILCLEAR, required: true },
    { col: 'H', source: 'traveler.passportType', valueMap: DOC_TYPE_SAILCLEAR, required: true },
    { col: 'I', source: 'traveler.passportNumber', required: true },
    { col: 'J', source: 'traveler.issuingAuthority', normalize: 'country', valueMap: COUNTRY_SAILCLEAR, required: true },
    { col: 'K', source: 'traveler.dateOfIssue', format: 'MM-DD-YYYY', required: true },
    { col: 'L', source: 'traveler.dateOfExpiry', format: 'MM-DD-YYYY', required: true },
    // Guests are Passenger; SailClear separately requires exactly one Master,
    // which is the captain and is not part of the travelers list.
    { col: 'M', constant: 'Passenger' },
    { col: 'O', constant: 'NA' },
  ],
};

/**
 * Vessel Details — everything here is a per-vessel static from the boat
 * record (2026-08-06 capture pinned the whole set for Anne Bonny) except the
 * charterer, which is per-trip (majority guest surname). Booleans arrive
 * from the extension already as the workbook's own "Yes"/"No" strings; a
 * tri-state null simply never sends the key, so the cell stays blank.
 */
const nvmcVesselDetails = {
  sheetName: 'Vessel Details',
  startRow: 5,
  dataType: 'single',
  columns: [
    { col: 'B', row: 5, source: 'boat.vesselName' },        // *Name
    { col: 'D', row: 5, source: 'boat.callSign' },          // *Call Sign
    { col: 'E', row: 5, source: 'boat.registrationNumber' }, // *ID Number
    { col: 'F', row: 5, source: 'boat.idType' },            // *ID Type
    { col: 'G', row: 5, source: 'boat.flagState', normalize: 'country', valueMap: COUNTRY_NVMC }, // *Flag
    { col: 'B', row: 7, source: 'boat.lessThan300GT' },     // *Less Than 300GT (Yes/No)
    { col: 'D', row: 7, source: 'boat.mmsi' },              // MMSI Number
    { col: 'B', row: 9, source: 'boat.owner' },             // *Owner
    { col: 'E', row: 9, source: 'boat.operator' },          // *Operator
    { col: 'G', row: 9, source: 'boat.classSociety' },      // *Class Society
    { col: 'B', row: 11, source: 'trip.charterer' },        // *Charterer
    { col: 'E', row: 11, source: 'boat.cofrOperator' },     // COFR Operator
    { col: 'B', row: 13, source: 'boat.vesselClass' },      // Class
    { col: 'D', row: 13, source: 'boat.vesselClassType' },  // Type
    { col: 'F', row: 13, source: 'boat.vesselSubType' },    // Sub-Type
    { col: 'B', row: 16, source: 'boat.oce' },              // *Operational Condition of Equipment
    { col: 'E', row: 16, source: 'boat.oceDescription' },   // *OCE Description
    // Fuel row 19 — NOTE the workbook's column order differs from the live
    // site's checkbox order (workbook: Oil, Electric, Nuclear, Low Flash...).
    { col: 'B', row: 19, source: 'boat.fuelOil' },
    { col: 'C', row: 19, source: 'boat.fuelElectric' },
    { col: 'D', row: 19, source: 'boat.fuelNuclear' },
    { col: 'E', row: 19, source: 'boat.fuelLowFlash' },
    { col: 'F', row: 19, source: 'boat.fuelLNG' },
    { col: 'G', row: 19, source: 'boat.fuelMethanol' },
    { col: 'H', row: 19, source: 'boat.fuelAmmonia' },
    { col: 'I', row: 19, source: 'boat.fuelHydrogen' },
    { col: 'J', row: 19, source: 'boat.fuelOther' },
    // Hidden FLAG_CODE (B47 label, B48 formula) — the VLOOKUP never
    // recalculates outside Excel, so the code is written as a literal, same
    // policy as the Non-Crew *_CODE columns.
    { col: 'B', row: 48, source: 'boat.flagState', normalize: 'country', valueMap: COUNTRY_CODE },
  ],
};

const nvmcReportingParty = {
  sheetName: 'Reporting Party',
  startRow: 5,
  dataType: 'single',
  columns: [
    { col: 'B', row: 5, source: '{captain.lastName}, {captain.firstName}' }, // *Name
    { col: 'E', row: 5, source: 'captain.email' },  // *Email
    { col: 'B', row: 7, source: 'captain.phone' },  // Phone
    { col: 'E', row: 7, source: 'captain.fax' },    // Fax
    // Either lat/long or Location Description satisfies the vessel-location
    // requirement; the 2026-08-06 filing used the departure port name alone.
    { col: 'B', row: 13, source: 'trip.locationDescription' }, // *Location Description
  ],
};

/**
 * Voyage Information. The extension flattens the wizard's trip into
 * leg-specific keys: a Departure notice sends the DEPARTURE + NEXT PORT OF
 * CALL blocks, an Arrival notice sends ARRIVAL + LAST PORT OF CALL. Both
 * block pairs are mapped unconditionally — fillCell skips empty non-required
 * values, so the non-applicable block simply stays blank.
 *
 * B5 and G7 are marked required ON PURPOSE: the blank template ships with
 * B5 pre-filled "Arrival" and G7 pre-filled "No", and required+empty writes
 * '' — clearing a misleading default beats keeping it.
 */
const nvmcVoyageInformation = {
  sheetName: 'Voyage Information',
  startRow: 10,
  dataType: 'single',
  columns: [
    { col: 'B', row: 5, source: 'trip.noticeType', required: true },  // *Notice Type (template pre-fills "Arrival")
    { col: 'D', row: 5, source: 'trip.voyageType' },                  // *Voyage Type
    { col: 'F', row: 5, constant: 'Initial' },                        // *Transaction Type — this tool only creates new filings
    { col: 'E', row: 7, source: 'trip.lessThan24hr' },                // *Less than 24HR Voyage? (Yes/No)
    { col: 'G', row: 7, source: 'trip.closedLoop', required: true },  // *Closed Loop Voyage? (template pre-fills "No")
    // 24-hour point of contact — the captain, by definition.
    { col: 'B', row: 10, source: '{captain.lastName}, {captain.firstName}' }, // *Name
    { col: 'B', row: 12, source: 'captain.email' },  // Email
    { col: 'D', row: 12, source: 'captain.phone' },  // *24 Hour Phone
    { col: 'F', row: 12, source: 'captain.fax' },    // Fax
    // ARRIVAL INFORMATION (arrival leg). E17/G17 depart-again date/time and
    // F19 Facility/Terminal stay with the captain — see unfilledRequired.
    { col: 'B', row: 15, source: 'trip.arrivalState' },   // *State
    { col: 'E', row: 15, source: 'trip.arrivalPortName' }, // *Port
    { col: 'B', row: 17, source: 'trip.arriveDate', format: 'YYYY-MM-DD' }, // *Arrive Date
    { col: 'D', row: 17, source: 'trip.arriveTime' },     // *Arrive Time (HH:MM)
    { col: 'B', row: 19, source: 'trip.arrivalCity' },    // *City
    // LAST PORT OF CALL (arrival leg): the foreign port just departed.
    // D22 State stays blank — a foreign last port has no US state.
    { col: 'B', row: 22, source: 'trip.lastCountry', normalize: 'country', valueMap: COUNTRY_NVMC }, // *Country
    { col: 'F', row: 22, source: 'trip.lastPortName' },   // *Port
    { col: 'B', row: 24, source: 'trip.lastPlace' },      // *Place
    { col: 'F', row: 24, source: 'trip.lastDepartDate', format: 'YYYY-MM-DD' }, // *Depart Date
    // DEPARTURE INFORMATION (departure leg).
    { col: 'B', row: 27, source: 'trip.departureCity' },  // *City
    { col: 'D', row: 27, source: 'trip.departureState' }, // *State
    { col: 'F', row: 27, source: 'trip.departurePortName' }, // *Port
    { col: 'B', row: 29, source: 'trip.departureDate', format: 'YYYY-MM-DD' }, // *Depart Date
    { col: 'E', row: 29, source: 'trip.departureTime' },  // *Depart Time (HH:MM)
    // NEXT PORT OF CALL (departure leg). D32 State blank — foreign.
    { col: 'B', row: 32, source: 'trip.nextCountry', normalize: 'country', valueMap: COUNTRY_NVMC }, // *Country
    { col: 'F', row: 32, source: 'trip.nextPortName' },   // *Port
    { col: 'B', row: 34, source: 'trip.nextPlace' },      // *Place (carries a typed-in port with no dropdown match)
    { col: 'D', row: 34, source: 'trip.nextArriveDate', format: 'YYYY-MM-DD' }, // *Arrive Date
    { col: 'F', row: 34, source: 'trip.nextArriveTime' }, // *Arrive Time (HH:MM)
    // Hidden helper row (labels on 42, formulas on 43) — written as literals
    // because nothing recalculates the formulas outside Excel. Port codes
    // come from the extension (port.json lookup; blank for US ports per the
    // workbook's own rule).
    { col: 'B', row: 43, source: 'trip.closedLoop' },                    // CLOSED_LOOP_VOYAGE
    { col: 'C', row: 43, source: 'trip.lastCountry', normalize: 'country', valueMap: COUNTRY_CODE }, // LAST_PORT_COUNTRY_CODE
    { col: 'D', row: 43, source: 'trip.lastPortCode' },                  // LAST_PORT_CODE
    { col: 'E', row: 43, source: 'trip.nextCountry', normalize: 'country', valueMap: COUNTRY_CODE }, // NEXT_PORT_COUNTRY_CODE
    { col: 'F', row: 43, source: 'trip.nextPortCode' },                  // NEXT_PORT_CODE
    { col: 'G', row: 43, source: 'trip.departDtDate', format: 'YYYY-MM-DD' }, // DEPART_DT (departure leg only)
    { col: 'H', row: 43, source: 'trip.departDtTime' },                  // DEPART_TIME
  ],
};

export const TEMPLATES = [
  {
    id: 'uscg-noad-8-2',
    name: 'USCG eNOAD - NOAD Workbook 8.2',
    urlPattern: 'https://enoad.nvmc.uscg.gov/*',
    description:
      'Official NVMC NOAD Workbook 8.2. Import via Add Notice > Import Notice, ' +
      'or email to enoad@nvmc.uscg.gov. Country codes are written as literals ' +
      'because the workbook VLOOKUPs do not recalculate outside Excel.',
    file: 'assets/templates/nvmc-noad-workbook-8.2.xlsx',
    storagePath: 'nvmc-noad-workbook-8.2.xlsx',
    sheets: [nvmcNonCrew, nvmcCrew, nvmcVesselDetails, nvmcReportingParty, nvmcVoyageInformation],
    // Exact cells the captain must still complete before importing —
    // genuinely per-voyage facts nothing in the extension holds.
    unfilledRequired: [
      'Voyage Information  B7 Notice ID',
      'Voyage Information  (arrival notice) E17 Depart-again Date · G17 Depart-again Time · F19 Facility/Terminal · D24 Last-Port Arrive Date',
      'Reporting Party  B11..I11 vessel lat/long (only if B13 Location Description is not enough)',
      'Vessel Details  F7 Vessel Tonnage (was accepted blank on a <300GT vessel 2026-08-06)',
      'Non-Crew  J Country of Residence · W..AC Embark Country/State/Port/Place/Date',
      'Crew List  embark block, position and longshoreman declaration',
    ],
  },
  {
    id: 'sailclear-individuals',
    name: 'SailClear - Individual Format',
    urlPattern: 'https://*sailclear.com/*',
    description:
      'SailClear bulk individual upload. Upload at /dashboard/individuals. ' +
      'Covers the person record only; vessel, voyage and health declaration ' +
      'are still entered in the wizard.',
    file: 'assets/templates/sailclear-individual-format.xlsx',
    storagePath: 'sailclear-individual-format.xlsx',
    sheets: [sailclearIndividuals],
    unfilledRequired: ['G BirthCountry when the passport prints a city rather than a country'],
  },
];
