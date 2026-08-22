# ANYGOLD Label Studio

A clean, modern dashboard for designing jewellery tags for the Zebra ZD421
300 DPI printer.

## Features

- Standard and fully custom label layouts
- QR Code, Code 128 and EAN-13 support
- Drag-and-drop positioning for each text line and code
- Adjustable tag size, text size, code size, print speed and darkness
- Ready-to-use Gold Tag preset with purity, weight and length
- Local Zebra printing through the included Windows print service
- Save generated ZPL files for later use

## Run locally

Requirements: Windows and Node.js 22.13 or newer.

```powershell
npm install
npm run dev
```

Open `http://localhost:3000` in a browser.

For direct USB printing, run `ZEBRA-WEB-PRINT-SERVICE.ps1` or use the included
`OPEN-ANYGOLD-WEB.ps1` launcher. The printer name is configured in
`ZEBRA-WEB-PRINT-SERVICE.ps1`.

## Online version

The hosted dashboard can be used to design and preview labels. Direct USB
printing requires the local Windows print service on the computer connected to
the Zebra printer.

## Build and test

```powershell
npm run build
npm test
```
