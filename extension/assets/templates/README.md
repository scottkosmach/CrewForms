# Vendored government form templates

Official templates, checked in so generation is reproducible and offline-capable.

## `nvmc-noad-workbook-8.2.xlsx`

**Official NVMC NOAD Workbook, Version 8.2** — released 2026-05-21, downloaded 2026-08-04. 1,101,979 bytes.

Source: <https://www.nvmc.uscg.gov/Forms/Official%20NVMC%20NOAD%20Workbook%20-%20Version%208.2.xlsx>
Landing page: <https://www.nvmc.uscg.gov/Items.aspx?id=32D47D72-5CDB-4A21-B119-1A623D27D833>

**⚠️ The download requires a `Referer` header.** Requested cold, the URL returns a ~8 KB HTML "Application Error" page with a 200 status, not the workbook. Always verify the result is a real xlsx (`PK\x03\x04` magic bytes, ~1.1 MB) before committing it.

```powershell
$url = "https://www.nvmc.uscg.gov/Forms/Official%20NVMC%20NOAD%20Workbook%20-%20Version%208.2.xlsx"
$ref = "https://www.nvmc.uscg.gov/Items.aspx?id=32D47D72-5CDB-4A21-B119-1A623D27D833"
$ua  = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
Invoke-WebRequest -Uri $url -Headers @{ Referer = $ref; "User-Agent" = $ua } `
  -OutFile "extension/assets/templates/nvmc-noad-workbook-8.2.xlsx"
```

### Sheets

`Instructions | Vessel Details | Reporting Party | Voyage Information | Crew List | Non-Crew List | Cargo and CDC List | Previous Foreign Ports | Security | Definitions | Map | Lookups` (Lookups is hidden).

Generation targets: **Vessel Details**, **Reporting Party**, **Voyage Information**, **Crew List**, **Non-Crew List**.

### Non-Crew List layout (`xl/worksheets/sheet6.xml`)

Dimension `B1:AR310`. **Header row 6**, row 7 blank, **data rows 8–310** (~303 passengers). Column `B` is pre-numbered.

`*` marks required: C `*Last Name`, D `*First Name`, E Middle Name, F `*Date of Birth (YYYY-MM-DD)`, G `*Sex`, H `*Nationality`, I `NATIONALITY_CODE`, J `*Country of Residence`, K `COUNTRY_RESIDENCE_CODE`, L `*ID Type`, M `*ID Number`, N `*ID Country`, O `ID_COUNTRY_CODE`, P ID Expiration Date, Q Record Locator, R–V US Address, W `*Embark Country`, X code, Y `*Embark State`, Z `*Embark Port`, AA code, AB `*Embark Place`, AC `*Embark Date`, AD–AJ Debark block, AK Cabin, AL/AM phones, AN–AR Secondary ID.

### Do not restructure the workbook

Industry guidance is consistent that adding or removing rows, columns, or sheets causes significant processing delays at NVMC. Fill cells only.

The `*_CODE` columns are VLOOKUP formulas whose cached values are empty in the blank template, so the generator must write resolved codes as literals — see `shared/reference/nvmc/README.md` for the encoding model and the extracted lookup tables.

### Version tracking

Schema **4.1** / Workbook **8.2** are current. Schema 4.0 and workbooks 8.0–8.1 are still accepted; anything below 4.0/8.0 is rejected.

USCG **MSIB 01-26** (2026-05-01) announced a SANS modernization affecting the eNOAD portal and all other submission methods — testing before 2026-12-31, transition by March 2027, with a stated commitment to preserve backward compatibility. A follow-on notice is expected around November 2026. **Re-check this template and the schema version then.**
