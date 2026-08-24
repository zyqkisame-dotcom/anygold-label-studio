"use client";

import QRCode from "qrcode";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type PrinterState = "checking" | "online" | "offline";
type Notice = { tone: "success" | "error"; message: string } | null;
type DesignMode = "standard" | "custom";
type CodeType = "qr" | "code128" | "ean13" | "none";
type TextPosition = { xMm: number; yMm: number };
type GoldTagDetails = { purity: string; weight: string; length: string };
type DragTarget =
  | { type: "text"; index: number }
  | { type: "standardText" }
  | { type: "logoMark" }
  | { type: "logoWordmark" }
  | { type: "qr" };
type PrintSettings = {
  labelWidthMm: number;
  labelHeightMm: number;
  textXmm: number;
  textYmm: number;
  qrXmm: number;
  qrYmm: number;
  qrSize: number;
  logoXmm: number;
  logoYmm: number;
  logoSize: number;
  markXmm: number;
  markYmm: number;
  markSize: number;
  textSize: number;
  speed: number;
  darkness: number;
};

const PRINT_SERVICE = "http://127.0.0.1:4210";
const DOTS_PER_MM = 300 / 25.4;
const SETTINGS_STORAGE_KEY = "anygold-zebra-print-settings";
const DESIGN_STORAGE_KEY = "anygold-zebra-custom-design";
const ANYGOLD_MARK_ROWS = [
  "00000000", "00000000", "00000000", "00004000", "0000E000", "0000E000", "0001E000", "0001F000",
  "0003F000", "0003F800", "0007F800", "0007FC00", "0007FC00", "000FFE00", "000FFE00", "001FFF00",
  "001FFF00", "003FFF00", "003E7F80", "007C1F80", "007C0FC0", "00FC07C0", "00F803E0", "01F803E0",
  "01F00000", "01F00000", "03E00000", "03E00000", "07E00000", "07C00000", "00000000", "00000000",
];
const CODE_TYPE_OPTIONS: Array<{
  id: CodeType;
  label: string;
  description: string;
  symbol: string;
}> = [
  { id: "qr", label: "QR Code", description: "Links & data", symbol: "▦" },
  { id: "code128", label: "Code 128", description: "Long barcode", symbol: "▥" },
  { id: "ean13", label: "EAN-13", description: "Retail code", symbol: "▥" },
  { id: "none", label: "No code", description: "Text only", symbol: "—" },
];
const DEFAULT_SETTINGS: PrintSettings = {
  labelWidthMm: 70,
  labelHeightMm: 35,
  textXmm: 5,
  textYmm: 7.5,
  qrXmm: 17.5,
  qrYmm: 7,
  qrSize: 4,
  logoXmm: 9,
  logoYmm: 4.5,
  logoSize: 30,
  markXmm: 5,
  markYmm: 4,
  markSize: 38,
  textSize: 28,
  speed: 2,
  darkness: 10,
};
const DEFAULT_CUSTOM_LINE_POSITIONS: TextPosition[] = Array.from(
  { length: 6 },
  (_, index) => ({ xMm: 5, yMm: 7.5 + index * 3 }),
);
const GOLD_TAG_LINE_POSITIONS: TextPosition[] = [
  { xMm: 5, yMm: 10 },
  { xMm: 5, yMm: 13.5 },
  { xMm: 5, yMm: 17 },
  { xMm: 5, yMm: 20.5 },
  { xMm: 5, yMm: 18.5 },
  { xMm: 5, yMm: 22 },
];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function mmToDots(value: number) {
  return Math.round(value * DOTS_PER_MM);
}

function buildAnyGoldMarkGraphic(x: number, y: number, requestedSize: number) {
  const size = Math.round(clamp(requestedSize, 12, 90));
  const bytesPerRow = Math.ceil(size / 8);
  const hexRows: string[] = [];

  for (let targetY = 0; targetY < size; targetY += 1) {
    const sourceY = Math.min(31, Math.floor((targetY * 32) / size));
    const sourceRow = Number.parseInt(ANYGOLD_MARK_ROWS[sourceY], 16);
    let rowHex = "";

    for (let byteIndex = 0; byteIndex < bytesPerRow; byteIndex += 1) {
      let byteValue = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const targetX = byteIndex * 8 + bit;
        byteValue <<= 1;
        if (targetX < size) {
          const sourceX = Math.min(31, Math.floor((targetX * 32) / size));
          byteValue |= (sourceRow >>> (31 - sourceX)) & 1;
        }
      }
      rowHex += byteValue.toString(16).padStart(2, "0").toUpperCase();
    }
    hexRows.push(rowHex);
  }

  const totalBytes = bytesPerRow * size;
  return `^FO${x},${y}^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hexRows.join("")}^FS`;
}

function SettingControl({
  id,
  label,
  value,
  minimum,
  maximum,
  step,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="setting-control">
      <div className="setting-control-topline">
        <label htmlFor={`${id}-range`}>{label}</label>
        <div className="setting-value">
          <input
            id={`${id}-number`}
            type="number"
            min={minimum}
            max={maximum}
            step={step}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            aria-label={`${label} in ${unit}`}
          />
          <span>{unit}</span>
        </div>
      </div>
      <input
        id={`${id}-range`}
        className="setting-range"
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function cleanZpl(value: string) {
  return value.trim().replace(/[\^~]/g, " ").replace(/[\r\n]+/g, " ");
}

function buildZpl(fields: {
  company: string;
  productName: string;
  productCode: string;
  tagNumber: string;
  designMode: DesignMode;
  customText: string;
  customLinePositions: TextPosition[];
  showBrandLogo: boolean;
  codeType: CodeType;
  qrData: string;
  quantity: number;
  settings: PrintSettings;
}) {
  const sourceLines = fields.designMode === "custom"
    ? fields.customText.split(/\r?\n/).slice(0, 6)
    : [fields.company, fields.productName, fields.productCode, fields.tagNumber];

  const textItems = sourceLines
    .map((line, sourceIndex) => ({ text: cleanZpl(line), sourceIndex }))
    .filter((item) => item.text);

  const settings = fields.settings;
  const labelWidth = mmToDots(clamp(settings.labelWidthMm, 20, 104));
  const labelHeight = mmToDots(clamp(settings.labelHeightMm, 10, 200));
  const textX = mmToDots(clamp(settings.textXmm, 0, settings.labelWidthMm));
  const textY = mmToDots(clamp(settings.textYmm, 0, settings.labelHeightMm));
  const qrX = mmToDots(clamp(settings.qrXmm, 0, settings.labelWidthMm));
  const qrY = mmToDots(clamp(settings.qrYmm, 0, settings.labelHeightMm));
  const logoX = mmToDots(clamp(settings.logoXmm, 0, settings.labelWidthMm));
  const logoY = mmToDots(clamp(settings.logoYmm, 0, settings.labelHeightMm));
  const markX = mmToDots(clamp(settings.markXmm, 0, settings.labelWidthMm));
  const markY = mmToDots(clamp(settings.markYmm, 0, settings.labelHeightMm));
  const logoHeight = Math.round(clamp(settings.logoSize, 12, 72));
  const logoWidth = Math.round(logoHeight * 0.82);
  const markSize = Math.round(clamp(settings.markSize, 12, 90));
  const fontHeight = Math.round(clamp(settings.textSize, 12, 60));
  const fontWidth = Math.round(fontHeight * 0.86);
  const lineStep = Math.round(fontHeight * 1.18);
  const qrSize = Math.round(clamp(settings.qrSize, 2, 10));
  const moduleWidth = Math.round(clamp(qrSize / 2, 1, 4));
  const barcodeHeight = Math.round(38 + qrSize * 10);
  const speed = Math.round(clamp(settings.speed, 2, 4));
  const darkness = Math.round(clamp(settings.darkness, 0, 30));

  const printableItems = textItems.length
    ? textItems
    : [{ text: "LABEL", sourceIndex: 0 }];
  const textCommands = printableItems
    .map((item, index) => {
      const customPosition = fields.customLinePositions[item.sourceIndex];
      const itemX = fields.designMode === "custom"
        ? mmToDots(clamp(customPosition?.xMm ?? settings.textXmm, 0, settings.labelWidthMm))
        : textX;
      const itemY = fields.designMode === "custom"
        ? mmToDots(clamp(customPosition?.yMm ?? settings.textYmm + index * 3, 0, settings.labelHeightMm))
        : textY + index * lineStep;
      return `^FO${itemX},${itemY}^A0N,${fontHeight},${fontWidth}^FD${item.text}^FS`;
    })
    .join("\r\n");

  const codeData = cleanZpl(fields.qrData);
  const codeCommand = !codeData || fields.codeType === "none"
    ? ""
    : fields.codeType === "code128"
      ? `^FO${qrX},${qrY}^BY${moduleWidth},2,${barcodeHeight}^BCN,${barcodeHeight},N,N,N,A^FD${codeData}^FS`
      : fields.codeType === "ean13"
        ? `^FO${qrX},${qrY}^BY${moduleWidth},2,${barcodeHeight}^BEN,${barcodeHeight},Y,N^FD${codeData}^FS`
        : `^FO${qrX},${qrY}^BQN,2,${qrSize}^FDLA,${codeData}^FS`;
  const logoCommand = fields.showBrandLogo
    ? [
        buildAnyGoldMarkGraphic(markX, markY, markSize),
        `^FO${logoX},${logoY}^A0N,${logoHeight},${logoWidth}^FDAnyGold^FS`,
      ].join("\r\n")
    : "";

  return [
    `~SD${darkness.toString().padStart(2, "0")}`,
    "^XA",
    `^PW${labelWidth}`,
    `^LL${labelHeight}`,
    "^LH0,0",
    "^LT0",
    "^LS0",
    "^MNY",
    `^PR${speed}`,
    logoCommand,
    textCommands,
    codeCommand,
    `^PQ${Math.max(1, Math.min(100, fields.quantity))},0,1,Y`,
    "^XZ",
  ]
    .filter(Boolean)
    .join("\r\n");
}

export default function Home() {
  const [company, setCompany] = useState("ANYGOLD");
  const [productName, setProductName] = useState("");
  const [productCode, setProductCode] = useState("AG916");
  const [tagNumber, setTagNumber] = useState("R042");
  const [autoQr, setAutoQr] = useState(true);
  const [manualQr, setManualQr] = useState("AG916-R042");
  const [designMode, setDesignMode] = useState<DesignMode>("standard");
  const [customText, setCustomText] = useState("ANYGOLD\nCUSTOM TAG\n001");
  const [customLinePositions, setCustomLinePositions] = useState<TextPosition[]>(
    DEFAULT_CUSTOM_LINE_POSITIONS,
  );
  const [selectedLineIndex, setSelectedLineIndex] = useState(0);
  const [customQr, setCustomQr] = useState("CUSTOM-001");
  const [customCodeType, setCustomCodeType] = useState<CodeType>("qr");
  const [showBrandLogo, setShowBrandLogo] = useState(false);
  const [goldTagDetails, setGoldTagDetails] = useState<GoldTagDetails>({
    purity: "916",
    weight: "20.00",
    length: "10",
  });
  const [quantity, setQuantity] = useState(1);
  const [codeImage, setCodeImage] = useState("");
  const [codeRenderError, setCodeRenderError] = useState("");
  const [printerState, setPrinterState] = useState<PrinterState>("checking");
  const [notice, setNotice] = useState<Notice>(null);
  const [printing, setPrinting] = useState(false);
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_SETTINGS);
  const [settingsStorageReady, setSettingsStorageReady] = useState(false);
  const [designStorageReady, setDesignStorageReady] = useState(false);
  const labelPaperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    target: DragTarget;
    offsetXmm: number;
    offsetYmm: number;
  } | null>(null);

  const standardQrData = autoQr
    ? [productCode.trim(), tagNumber.trim()].filter(Boolean).join("-")
    : manualQr;

  const codeType: CodeType = designMode === "custom" ? customCodeType : "qr";
  const qrData = designMode === "custom"
    ? (customCodeType === "none" ? "" : customQr)
    : standardQrData;
  const codeValidationError = designMode === "custom" && codeType !== "none" && !qrData.trim()
    ? "Enter content for the code."
    : designMode === "custom" && codeType === "ean13" && !/^\d{12}$/.test(qrData)
      ? "EAN-13 requires exactly 12 digits."
      : "";
  const activeCodeOption = CODE_TYPE_OPTIONS.find((option) => option.id === codeType)
    ?? CODE_TYPE_OPTIONS[0];

  const printLineItems = useMemo(
    () => designMode === "custom"
      ? customText
        .split(/\r?\n/)
        .slice(0, 6)
        .map((text, sourceIndex) => ({ text: text.trim(), sourceIndex }))
        .filter((item) => item.text)
      : [company, productName, productCode, tagNumber]
        .map((text, sourceIndex) => ({ text: text.trim(), sourceIndex }))
        .filter((item) => item.text),
    [company, customText, designMode, productName, productCode, tagNumber],
  );
  const selectedLinePosition = customLinePositions[selectedLineIndex]
    ?? DEFAULT_CUSTOM_LINE_POSITIONS[selectedLineIndex]
    ?? DEFAULT_CUSTOM_LINE_POSITIONS[0];

  useEffect(() => {
    let active = true;
    let requestController: AbortController | null = null;

    async function checkPrinter() {
      if (!active) return;
      requestController?.abort();
      const controller = new AbortController();
      requestController = controller;
      const timeout = window.setTimeout(() => controller.abort(), 4000);

      try {
        const response = await fetch(`${PRINT_SERVICE}/status`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Printer service unavailable");
        const result = await response.json();
        if (result.online !== true) throw new Error("Printer is offline");
        if (active) setPrinterState("online");
      } catch {
        if (active) setPrinterState("offline");
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void checkPrinter();
    const interval = window.setInterval(() => void checkPrinter(), 10000);
    window.addEventListener("focus", checkPrinter);

    return () => {
      active = false;
      requestController?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", checkPrinter);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setCodeRenderError("");

    async function renderCode() {
      if (!qrData || codeType === "none" || codeValidationError) {
        setCodeImage("");
        return;
      }

      try {
        if (codeType === "qr") {
          const image = await QRCode.toDataURL(qrData, {
            width: 220,
            margin: 1,
            errorCorrectionLevel: "M",
            color: { dark: "#0e0f0c", light: "#ffffff" },
          });
          if (active) setCodeImage(image);
          return;
        }

        const { default: JsBarcode } = await import("jsbarcode");
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svg, qrData, {
          format: codeType === "ean13" ? "EAN13" : "CODE128",
          displayValue: codeType === "ean13",
          background: "#ffffff",
          lineColor: "#000000",
          width: 2,
          height: 76,
          margin: 4,
          fontSize: 15,
        });
        const markup = new XMLSerializer().serializeToString(svg);
        if (active) {
          setCodeImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
        }
      } catch (error) {
        console.error("Barcode preview error", error);
        if (active) {
          setCodeImage("");
          setCodeRenderError("The content is invalid for this code type.");
        }
      }
    }

    void renderCode();
    return () => {
      active = false;
    };
  }, [codeType, codeValidationError, qrData]);

  useEffect(() => {
    if (autoQr) setManualQr(standardQrData);
  }, [autoQr, standardQrData]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<PrintSettings>;
        const legacyLogoX = Number.isFinite(parsed.logoXmm) ? parsed.logoXmm as number : 5;
        const legacyLogoY = Number.isFinite(parsed.logoYmm) ? parsed.logoYmm as number : 4;
        const legacyLogoSize = Number.isFinite(parsed.logoSize) ? parsed.logoSize as number : 30;
        const hasSeparateMark = Number.isFinite(parsed.markXmm)
          && Number.isFinite(parsed.markYmm)
          && Number.isFinite(parsed.markSize);
        setSettings({
          ...DEFAULT_SETTINGS,
          ...parsed,
          markXmm: hasSeparateMark ? parsed.markXmm as number : legacyLogoX,
          markYmm: hasSeparateMark ? parsed.markYmm as number : legacyLogoY,
          markSize: hasSeparateMark ? parsed.markSize as number : Math.round(legacyLogoSize * 1.25),
          logoXmm: hasSeparateMark
            ? legacyLogoX
            : legacyLogoX + (legacyLogoSize * 1.57) / DOTS_PER_MM,
          logoYmm: hasSeparateMark
            ? legacyLogoY
            : legacyLogoY + (legacyLogoSize * 0.125) / DOTS_PER_MM,
        });
      }
    } catch {
      window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } finally {
      setSettingsStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!settingsStorageReady) return;
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings, settingsStorageReady]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DESIGN_STORAGE_KEY);
      if (stored) {
        const design = JSON.parse(stored);
        if (design.designMode === "standard" || design.designMode === "custom") {
          setDesignMode(design.designMode);
        }
        if (typeof design.customText === "string") setCustomText(design.customText);
        if (typeof design.customQr === "string") setCustomQr(design.customQr);
        if (typeof design.showBrandLogo === "boolean") setShowBrandLogo(design.showBrandLogo);
        if (Array.isArray(design.customLinePositions)) {
          setCustomLinePositions(
            DEFAULT_CUSTOM_LINE_POSITIONS.map((fallback, index) => {
              const storedPosition = design.customLinePositions[index];
              return {
                xMm: Number.isFinite(storedPosition?.xMm) ? storedPosition.xMm : fallback.xMm,
                yMm: Number.isFinite(storedPosition?.yMm) ? storedPosition.yMm : fallback.yMm,
              };
            }),
          );
        }
        if (CODE_TYPE_OPTIONS.some((option) => option.id === design.customCodeType)) {
          setCustomCodeType(design.customCodeType);
        } else if (design.customShowQr === false) {
          setCustomCodeType("none");
        }
      }
    } catch {
      window.localStorage.removeItem(DESIGN_STORAGE_KEY);
    } finally {
      setDesignStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!designStorageReady) return;
    window.localStorage.setItem(
      DESIGN_STORAGE_KEY,
      JSON.stringify({
        designMode,
        customText,
        customQr,
        customCodeType,
        customLinePositions,
        showBrandLogo,
      }),
    );
  }, [customCodeType, customLinePositions, customQr, customText, designMode, designStorageReady, showBrandLogo]);

  useEffect(() => {
    if (designMode !== "custom") return;
    if (!printLineItems.some((item) => item.sourceIndex === selectedLineIndex)) {
      setSelectedLineIndex(printLineItems[0]?.sourceIndex ?? 0);
    }
  }, [designMode, printLineItems, selectedLineIndex]);

  useEffect(() => {
    if (customCodeType === "ean13" && !/^\d{12}$/.test(customQr)) {
      setCustomQr("955123456789");
    } else if (customCodeType === "code128" && !customQr.trim()) {
      setCustomQr("AG916-R042");
    } else if (customCodeType === "qr" && !customQr.trim()) {
      setCustomQr("CUSTOM-001");
    }
  }, [customCodeType]);

  function applyCodeType(type: CodeType) {
    setCustomCodeType(type);
    if (type === "ean13" && !/^\d{12}$/.test(customQr)) {
      setCustomQr("955123456789");
    } else if (type === "code128" && !customQr.trim()) {
      setCustomQr("AG916-R042");
    } else if (type === "qr" && !customQr.trim()) {
      setCustomQr("CUSTOM-001");
    }
  }

  function applyGoldTagPreset() {
    const purity = goldTagDetails.purity.trim() || "916";
    const weight = goldTagDetails.weight.trim() || "20.00";
    const length = goldTagDetails.length.trim() || "10";

    setDesignMode("custom");
    setCustomText([
      `PURITY ${purity}`,
      `WEIGHT ${weight}G`,
      `LENGTH ${length}CM`,
    ].join("\n"));
    setCustomLinePositions(GOLD_TAG_LINE_POSITIONS);
    setSelectedLineIndex(0);
    setShowBrandLogo(true);
    setCustomCodeType("qr");
    setCustomQr(`ANYGOLD-${purity}-${weight}G-${length}CM`);
    setSettings((current) => ({
      ...current,
      labelWidthMm: 70,
      labelHeightMm: 35,
      textSize: 18,
      logoXmm: 9,
      logoYmm: 4.5,
      logoSize: 30,
      markXmm: 5,
      markYmm: 4,
      markSize: 38,
      qrXmm: 8,
      qrYmm: 20.5,
      qrSize: 2,
    }));
    setNotice({ tone: "success", message: "Gold Tag design applied." });
  }

  function updateSetting<Key extends keyof PrintSettings>(key: Key, value: number) {
    if (!Number.isFinite(value)) return;
    setSettings((current) => {
      const next = { ...current, [key]: value } as PrintSettings;
      next.labelWidthMm = clamp(next.labelWidthMm, 20, 104);
      next.labelHeightMm = clamp(next.labelHeightMm, 10, 200);
      next.textXmm = clamp(next.textXmm, 0, next.labelWidthMm);
      next.textYmm = clamp(next.textYmm, 0, next.labelHeightMm);
      next.qrXmm = clamp(next.qrXmm, 0, next.labelWidthMm);
      next.qrYmm = clamp(next.qrYmm, 0, next.labelHeightMm);
      next.logoXmm = clamp(next.logoXmm, 0, next.labelWidthMm);
      next.logoYmm = clamp(next.logoYmm, 0, next.labelHeightMm);
      next.markXmm = clamp(next.markXmm, 0, next.labelWidthMm);
      next.markYmm = clamp(next.markYmm, 0, next.labelHeightMm);
      next.qrSize = Math.round(clamp(next.qrSize, 2, 10));
      next.logoSize = Math.round(clamp(next.logoSize, 12, 72));
      next.markSize = Math.round(clamp(next.markSize, 12, 90));
      next.textSize = Math.round(clamp(next.textSize, 12, 60));
      next.speed = Math.round(clamp(next.speed, 2, 4));
      next.darkness = Math.round(clamp(next.darkness, 0, 30));
      return next;
    });
  }

  function updateCustomLinePosition(index: number, axis: keyof TextPosition, value: number) {
    if (!Number.isFinite(value)) return;
    setCustomLinePositions((current) => current.map((position, positionIndex) => {
      if (positionIndex !== index) return position;
      return {
        ...position,
        [axis]: axis === "xMm"
          ? clamp(value, 0, settings.labelWidthMm)
          : clamp(value, 0, settings.labelHeightMm),
      };
    }));
  }

  function startPreviewDrag(
    target: DragTarget,
    event: ReactPointerEvent<HTMLElement>,
  ) {
    const paper = labelPaperRef.current;
    if (!paper) return;
    const bounds = paper.getBoundingClientRect();
    const pointerXmm = ((event.clientX - bounds.left) / bounds.width) * settings.labelWidthMm;
    const pointerYmm = ((event.clientY - bounds.top) / bounds.height) * settings.labelHeightMm;
    const textPosition = target.type === "text"
      ? customLinePositions[target.index] ?? DEFAULT_CUSTOM_LINE_POSITIONS[target.index]
      : null;
    const currentXmm = target.type === "text"
      ? textPosition?.xMm ?? 0
      : target.type === "standardText"
        ? settings.textXmm
        : target.type === "logoMark"
          ? settings.markXmm
          : target.type === "logoWordmark"
          ? settings.logoXmm
          : settings.qrXmm;
    const currentYmm = target.type === "text"
      ? textPosition?.yMm ?? 0
      : target.type === "standardText"
        ? settings.textYmm
        : target.type === "logoMark"
          ? settings.markYmm
          : target.type === "logoWordmark"
          ? settings.logoYmm
          : settings.qrYmm;
    if (target.type === "text") setSelectedLineIndex(target.index);
    dragRef.current = {
      target,
      offsetXmm: pointerXmm - currentXmm,
      offsetYmm: pointerYmm - currentYmm,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function movePreviewDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const paper = labelPaperRef.current;
    if (!drag || !paper) return;
    const bounds = paper.getBoundingClientRect();
    const xMm = clamp(
      ((event.clientX - bounds.left) / bounds.width) * settings.labelWidthMm - drag.offsetXmm,
      0,
      settings.labelWidthMm,
    );
    const yMm = clamp(
      ((event.clientY - bounds.top) / bounds.height) * settings.labelHeightMm - drag.offsetYmm,
      0,
      settings.labelHeightMm,
    );
    if (drag.target.type === "text") {
      setCustomLinePositions((current) => current.map((position, index) =>
        index === drag.target.index
          ? { xMm: Math.round(xMm * 2) / 2, yMm: Math.round(yMm * 2) / 2 }
          : position,
      ));
    } else if (drag.target.type === "standardText") {
      setSettings((current) => ({
        ...current,
        textXmm: Math.round(xMm * 2) / 2,
        textYmm: Math.round(yMm * 2) / 2,
      }));
    } else if (drag.target.type === "logoMark") {
      setSettings((current) => ({
        ...current,
        markXmm: Math.round(xMm * 2) / 2,
        markYmm: Math.round(yMm * 2) / 2,
      }));
    } else if (drag.target.type === "logoWordmark") {
      setSettings((current) => ({
        ...current,
        logoXmm: Math.round(xMm * 2) / 2,
        logoYmm: Math.round(yMm * 2) / 2,
      }));
    } else {
      setSettings((current) => ({
        ...current,
        qrXmm: Math.round(xMm * 2) / 2,
        qrYmm: Math.round(yMm * 2) / 2,
      }));
    }
  }

  function endPreviewDrag(event: ReactPointerEvent<HTMLElement>) {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const fields = {
    company,
    productName,
    productCode,
    tagNumber,
    designMode,
    customText,
    customLinePositions,
    showBrandLogo: designMode === "custom" && showBrandLogo,
    codeType,
    qrData,
    quantity,
    settings,
  };

  const labelWidthDots = mmToDots(settings.labelWidthMm);
  const codePreviewWidth = codeType === "qr"
    ? Math.min(60, (settings.qrSize * 29 * 100) / labelWidthDots)
    : Math.min(45, 16 + settings.qrSize * 4);
  const labelPreviewStyle = {
    aspectRatio: `${settings.labelWidthMm} / ${settings.labelHeightMm}`,
    "--text-left": `${(settings.textXmm / settings.labelWidthMm) * 100}%`,
    "--text-top": `${(settings.textYmm / settings.labelHeightMm) * 100}%`,
    "--text-size": `${(settings.textSize / labelWidthDots) * 100}cqw`,
    "--logo-word-left": `${(settings.logoXmm / settings.labelWidthMm) * 100}%`,
    "--logo-word-top": `${(settings.logoYmm / settings.labelHeightMm) * 100}%`,
    "--logo-word-size": `${(settings.logoSize / labelWidthDots) * 100}cqw`,
    "--logo-mark-left": `${(settings.markXmm / settings.labelWidthMm) * 100}%`,
    "--logo-mark-top": `${(settings.markYmm / settings.labelHeightMm) * 100}%`,
    "--logo-mark-size": `${(settings.markSize / labelWidthDots) * 100}cqw`,
    "--qr-left": `${(settings.qrXmm / settings.labelWidthMm) * 100}%`,
    "--qr-top": `${(settings.qrYmm / settings.labelHeightMm) * 100}%`,
    "--qr-width": `${codePreviewWidth}%`,
  } as CSSProperties;

  async function printLabel() {
    setNotice(null);
    if (codeValidationError || codeRenderError) {
      setNotice({ tone: "error", message: codeValidationError || codeRenderError });
      return;
    }
    setPrinting(true);
    try {
      const response = await fetch(`${PRINT_SERVICE}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Print failed");
      setPrinterState("online");
      setNotice({
        tone: "success",
        message: `${quantity} label${quantity === 1 ? "" : "s"} sent to Zebra.`,
      });
    } catch {
      setPrinterState("offline");
      setNotice({
        tone: "error",
        message: "The print service is not running. Open it with the ANYGOLD Web Label Studio shortcut.",
      });
    } finally {
      setPrinting(false);
    }
  }

  function saveZpl() {
    if (codeValidationError || codeRenderError) {
      setNotice({ tone: "error", message: codeValidationError || codeRenderError });
      return;
    }
    const blob = new Blob([buildZpl(fields)], { type: "text/plain;charset=us-ascii" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = designMode === "custom"
      ? "CUSTOM-LABEL.zpl"
      : `LABEL-${productCode || "PRODUCT"}-${tagNumber || "TAG"}.zpl`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice({ tone: "success", message: "ZPL file saved." });
  }

  function resetSample() {
    if (designMode === "custom") {
      setCustomText("ANYGOLD\nCUSTOM TAG\n001");
      setCustomLinePositions(DEFAULT_CUSTOM_LINE_POSITIONS);
      setSelectedLineIndex(0);
      setCustomQr("CUSTOM-001");
      setCustomCodeType("qr");
      setShowBrandLogo(false);
      setNotice(null);
      return;
    }
    setCompany("ANYGOLD");
    setProductName("");
    setProductCode("AG916");
    setTagNumber("R042");
    setAutoQr(true);
    setManualQr("AG916-R042");
    setQuantity(1);
    setNotice(null);
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand-lockup" aria-label="AnyGold Label Studio">
          <div>
            <div className="brand-name">AnyGold</div>
            <div className="brand-product">Label Studio</div>
          </div>
        </div>

        <div className={`printer-pill ${printerState}`}>
          <span className="status-dot" aria-hidden="true" />
          {printerState === "online"
            ? "Zebra online"
            : printerState === "checking"
              ? "Checking printer"
              : "Printer offline"}
        </div>
      </header>

      <section className="page-shell">
        <div className="intro">
          <div>
            <p className="eyebrow">Zebra ZD421 · 300 DPI</p>
            <h1>Label printing,<br />made simple.</h1>
          </div>
          <p className="intro-copy">
            Update the details, review the result, then print. One clean workspace
            for every jewellery tag.
          </p>
        </div>

        <div className="workspace">
          <section className="editor-card" aria-labelledby="details-title">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Edit</p>
                <h2 id="details-title">Label design</h2>
              </div>
              <button className="text-button" onClick={resetSample} type="button">
                Reset design
              </button>
            </div>

            <div className="design-tabs" role="tablist" aria-label="Label design type">
              <button
                type="button"
                role="tab"
                aria-selected={designMode === "standard"}
                className={designMode === "standard" ? "active" : ""}
                onClick={() => setDesignMode("standard")}
              >
                Standard label
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={designMode === "custom"}
                className={designMode === "custom" ? "active" : ""}
                onClick={() => setDesignMode("custom")}
              >
                Custom design
              </button>
            </div>

            {designMode === "standard" ? (
              <div className="form-grid">
              <label className="field full">
                <span>Company name</span>
                <input
                  value={company}
                  onChange={(event) => setCompany(event.target.value.toUpperCase())}
                  maxLength={12}
                  placeholder="ANYGOLD"
                />
              </label>

              <label className="field full">
                <span>Product name <small>Optional</small></span>
                <input
                  value={productName}
                  onChange={(event) => setProductName(event.target.value.toUpperCase())}
                  maxLength={12}
                  placeholder="Example: RING"
                />
              </label>

              <label className="field">
                <span>Product code</span>
                <input
                  value={productCode}
                  onChange={(event) => setProductCode(event.target.value.toUpperCase())}
                  maxLength={12}
                  placeholder="AG916"
                />
              </label>

              <label className="field">
                <span>Tag number</span>
                <input
                  value={tagNumber}
                  onChange={(event) => setTagNumber(event.target.value.toUpperCase())}
                  maxLength={12}
                  placeholder="R042"
                />
              </label>

              <div className="field full qr-field">
                <div className="field-topline">
                  <span>QR content</span>
                  <label className="switch-row">
                    <input
                      type="checkbox"
                      checked={autoQr}
                      onChange={(event) => setAutoQr(event.target.checked)}
                    />
                    <span className="switch" aria-hidden="true" />
                    Auto
                  </label>
                </div>
                <input
                  value={qrData}
                  onChange={(event) => setManualQr(event.target.value)}
                  disabled={autoQr}
                  maxLength={120}
                  aria-label="QR content"
                />
              </div>
              </div>
            ) : (
              <section className="custom-design-area" aria-labelledby="custom-design-title">
                <div className="custom-design-heading">
                  <div>
                    <span className="custom-step">Custom</span>
                    <h3 id="custom-design-title">Build your own label</h3>
                  </div>
                  <span className="line-count">{printLineItems.length}/6 lines</span>
                </div>

                <section className="gold-template-card" aria-labelledby="gold-template-title">
                  <div className="gold-template-heading">
                    <div>
                      <span>Ready-to-use preset</span>
                      <h4 id="gold-template-title">Gold Tag</h4>
                      <p>AnyGold logo and QR with purity, weight and item length.</p>
                    </div>
                    <span className="template-badge">70 × 35 mm</span>
                  </div>

                  <div className="gold-template-body">
                    <div className="gold-tag-mini-preview" aria-hidden="true">
                      <div>
                        <strong className="gold-tag-logo-lockup">
                          <img className="gold-tag-logo-mark" src="/anygold-a.png" alt="" />
                          <span className="gold-tag-wordmark">AnyGold</span>
                        </strong>
                        <span>PURITY {goldTagDetails.purity || "916"}</span>
                        <span>WEIGHT {goldTagDetails.weight || "20.00"}G</span>
                        <span>LENGTH {goldTagDetails.length || "10"}CM</span>
                      </div>
                      <span className="gold-tag-mini-qr">▦</span>
                    </div>

                    <div className="gold-template-fields">
                      <label>
                        <span>Purity</span>
                        <input
                          value={goldTagDetails.purity}
                          inputMode="numeric"
                          maxLength={4}
                          onChange={(event) => setGoldTagDetails((current) => ({
                            ...current,
                            purity: event.target.value.replace(/\D/g, "").slice(0, 4),
                          }))}
                          aria-label="Gold purity"
                          placeholder="916"
                        />
                      </label>
                      <label>
                        <span>Weight</span>
                        <div className="template-input-unit">
                          <input
                            value={goldTagDetails.weight}
                            inputMode="decimal"
                            maxLength={7}
                            onChange={(event) => setGoldTagDetails((current) => ({
                              ...current,
                              weight: event.target.value
                                .replace(/[^\d.]/g, "")
                                .replace(/(\..*)\./g, "$1")
                                .slice(0, 7),
                            }))}
                            aria-label="Gold weight in grams"
                            placeholder="20.00"
                          />
                          <span>g</span>
                        </div>
                      </label>
                      <label>
                        <span>Length</span>
                        <div className="template-input-unit">
                          <input
                            value={goldTagDetails.length}
                            inputMode="decimal"
                            maxLength={6}
                            onChange={(event) => setGoldTagDetails((current) => ({
                              ...current,
                              length: event.target.value
                                .replace(/[^\d.]/g, "")
                                .replace(/(\..*)\./g, "$1")
                                .slice(0, 6),
                            }))}
                            aria-label="Item length in centimetres"
                            placeholder="10"
                          />
                          <span>cm</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <button className="gold-template-button" type="button" onClick={applyGoldTagPreset}>
                    Use this design
                    <span aria-hidden="true">→</span>
                  </button>
                </section>

                <label className="print-logo-option">
                  <input
                    type="checkbox"
                    checked={showBrandLogo}
                    onChange={(event) => setShowBrandLogo(event.target.checked)}
                  />
                  <span className="print-logo-option-mark" aria-hidden="true">
                    <img src="/anygold-a.png" alt="" />
                  </span>
                  <span>
                    <strong>Print complete AnyGold logo</strong>
                    <small>Move and resize the A logo and AnyGold text separately.</small>
                  </span>
                  <span className="print-logo-option-state">{showBrandLogo ? "On" : "Off"}</span>
                </label>

                <div className="code-type-selector notranslate" translate="no">
                  <div className="code-type-heading">
                    <strong>Code type</strong>
                    <small>Choose the code format for this tag.</small>
                  </div>
                  <div className="code-type-options" role="group" aria-label="Code type options">
                    {CODE_TYPE_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={customCodeType === option.id ? "active" : ""}
                        aria-pressed={customCodeType === option.id}
                        onClick={() => applyCodeType(option.id)}
                      >
                        <span className={`code-type-symbol ${option.id}`} aria-hidden="true">
                          {option.symbol}
                        </span>
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="custom-qr-box notranslate" translate="no">
                  <div className="field-topline">
                    <div>
                      <strong>{activeCodeOption.label}</strong>
                      <small>
                        {codeType === "ean13"
                          ? "Enter 12 digits; the printer generates the check digit."
                          : codeType === "code128"
                            ? "Suitable for product codes with letters and numbers."
                            : codeType === "qr"
                              ? "Use text, a product code or a URL."
                              : "No code will be printed."}
                      </small>
                    </div>
                  </div>
                  {codeType !== "none" && (
                    <input
                      value={customQr}
                      inputMode={codeType === "ean13" ? "numeric" : "text"}
                      onChange={(event) => {
                        const value = codeType === "ean13"
                          ? event.target.value.replace(/\D/g, "").slice(0, 12)
                          : event.target.value;
                        setCustomQr(value);
                      }}
                      maxLength={codeType === "ean13" ? 12 : codeType === "code128" ? 48 : 120}
                      aria-label={`${activeCodeOption.label} content`}
                      placeholder={codeType === "ean13" ? "955123456789" : "CUSTOM-001 or URL"}
                    />
                  )}
                  {(codeValidationError || codeRenderError) && (
                    <p className="code-error">{codeValidationError || codeRenderError}</p>
                  )}
                </div>

                <label className="custom-text-field">
                  <span>Label text <small>One text item per line</small></span>
                  <textarea
                    value={customText}
                    rows={6}
                    maxLength={180}
                    spellCheck={false}
                    onChange={(event) => {
                      const nextLines = event.target.value.split(/\r?\n/).slice(0, 6);
                      setCustomText(nextLines.join("\n").toUpperCase());
                    }}
                    placeholder={"ANYGOLD\nCUSTOM TAG\n001"}
                  />
                </label>

                <div className="custom-design-tip">
                  <span aria-hidden="true">↗</span>
                  <p><strong>Move each line separately.</strong> Click or drag a line in the preview to position it independently.</p>
                </div>
              </section>
            )}

            <section className="settings-panel" aria-labelledby="settings-title">
              <div className="settings-heading">
                <div>
                  <p className="section-kicker">Settings</p>
                  <h3 id="settings-title">Size &amp; position</h3>
                </div>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setSettings(DEFAULT_SETTINGS);
                    setCustomLinePositions(DEFAULT_CUSTOM_LINE_POSITIONS);
                    setSelectedLineIndex(0);
                  }}
                >
                  Reset settings
                </button>
              </div>
              <p className="settings-note">
                Move a slider, enter a number, or drag text and codes directly in the preview.
              </p>

              <div className="settings-grid">
                <fieldset className="settings-group">
                  <legend>Tag size</legend>
                  <SettingControl
                    id="label-width"
                    label="Width"
                    value={settings.labelWidthMm}
                    minimum={20}
                    maximum={104}
                    step={0.5}
                    unit="mm"
                    onChange={(value) => updateSetting("labelWidthMm", value)}
                  />
                  <SettingControl
                    id="label-height"
                    label="Height"
                    value={settings.labelHeightMm}
                    minimum={10}
                    maximum={200}
                    step={0.5}
                    unit="mm"
                    onChange={(value) => updateSetting("labelHeightMm", value)}
                  />
                </fieldset>

                <fieldset className="settings-group text-settings-group">
                  <legend>{designMode === "custom" ? `Text ${selectedLineIndex + 1}` : "Text"}</legend>
                  {designMode === "custom" && (
                    <div className="line-position-selector" role="group" aria-label="Select a text line to adjust">
                      {printLineItems.length ? printLineItems.map((item) => (
                        <button
                          key={`line-selector-${item.sourceIndex}`}
                          type="button"
                          className={selectedLineIndex === item.sourceIndex ? "active" : ""}
                          aria-pressed={selectedLineIndex === item.sourceIndex}
                          onClick={() => setSelectedLineIndex(item.sourceIndex)}
                          title={item.text}
                        >
                          <span>{item.sourceIndex + 1}</span>
                          {item.text}
                        </button>
                      )) : (
                        <span className="empty-line-message">Enter label text first</span>
                      )}
                    </div>
                  )}
                  <SettingControl
                    id={designMode === "custom" ? `text-${selectedLineIndex}-x` : "text-x"}
                    label="Left ↔ right"
                    value={designMode === "custom" ? selectedLinePosition.xMm : settings.textXmm}
                    minimum={0}
                    maximum={settings.labelWidthMm}
                    step={0.5}
                    unit="mm"
                    onChange={(value) => designMode === "custom"
                      ? updateCustomLinePosition(selectedLineIndex, "xMm", value)
                      : updateSetting("textXmm", value)}
                  />
                  <SettingControl
                    id={designMode === "custom" ? `text-${selectedLineIndex}-y` : "text-y"}
                    label="Up ↕ down"
                    value={designMode === "custom" ? selectedLinePosition.yMm : settings.textYmm}
                    minimum={0}
                    maximum={settings.labelHeightMm}
                    step={0.5}
                    unit="mm"
                    onChange={(value) => designMode === "custom"
                      ? updateCustomLinePosition(selectedLineIndex, "yMm", value)
                      : updateSetting("textYmm", value)}
                  />
                  <SettingControl
                    id="text-size"
                    label="Text size"
                    value={settings.textSize}
                    minimum={12}
                    maximum={60}
                    step={1}
                    unit="dot"
                    onChange={(value) => updateSetting("textSize", value)}
                  />
                </fieldset>

                {designMode === "custom" && showBrandLogo && (
                  <fieldset className="settings-group logo-settings-group">
                    <legend>A logo</legend>
                    <SettingControl
                      id="mark-x"
                      label="Left ↔ right"
                      value={settings.markXmm}
                      minimum={0}
                      maximum={settings.labelWidthMm}
                      step={0.5}
                      unit="mm"
                      onChange={(value) => updateSetting("markXmm", value)}
                    />
                    <SettingControl
                      id="mark-y"
                      label="Up ↕ down"
                      value={settings.markYmm}
                      minimum={0}
                      maximum={settings.labelHeightMm}
                      step={0.5}
                      unit="mm"
                      onChange={(value) => updateSetting("markYmm", value)}
                    />
                    <SettingControl
                      id="mark-size"
                      label="A logo size"
                      value={settings.markSize}
                      minimum={12}
                      maximum={90}
                      step={1}
                      unit="dot"
                      onChange={(value) => updateSetting("markSize", value)}
                    />
                  </fieldset>
                )}

                {designMode === "custom" && showBrandLogo && (
                  <fieldset className="settings-group logo-settings-group">
                    <legend>AnyGold text</legend>
                    <SettingControl
                      id="logo-word-x"
                      label="Left ↔ right"
                      value={settings.logoXmm}
                      minimum={0}
                      maximum={settings.labelWidthMm}
                      step={0.5}
                      unit="mm"
                      onChange={(value) => updateSetting("logoXmm", value)}
                    />
                    <SettingControl
                      id="logo-word-y"
                      label="Up ↕ down"
                      value={settings.logoYmm}
                      minimum={0}
                      maximum={settings.labelHeightMm}
                      step={0.5}
                      unit="mm"
                      onChange={(value) => updateSetting("logoYmm", value)}
                    />
                    <SettingControl
                      id="logo-word-size"
                      label="AnyGold text size"
                      value={settings.logoSize}
                      minimum={12}
                      maximum={72}
                      step={1}
                      unit="dot"
                      onChange={(value) => updateSetting("logoSize", value)}
                    />
                  </fieldset>
                )}

                <fieldset className="settings-group">
                  <legend>Code</legend>
                  <SettingControl
                    id="qr-x"
                    label="Left ↔ right"
                    value={settings.qrXmm}
                    minimum={0}
                    maximum={settings.labelWidthMm}
                    step={0.5}
                    unit="mm"
                    onChange={(value) => updateSetting("qrXmm", value)}
                  />
                  <SettingControl
                    id="qr-y"
                    label="Up ↕ down"
                    value={settings.qrYmm}
                    minimum={0}
                    maximum={settings.labelHeightMm}
                    step={0.5}
                    unit="mm"
                    onChange={(value) => updateSetting("qrYmm", value)}
                  />
                  <SettingControl
                    id="qr-size"
                    label="Code size"
                    value={settings.qrSize}
                    minimum={2}
                    maximum={10}
                    step={1}
                    unit="×"
                    onChange={(value) => updateSetting("qrSize", value)}
                  />
                </fieldset>

                <fieldset className="settings-group printer-settings">
                  <legend>Print quality</legend>
                  <SettingControl
                    id="print-speed"
                    label="Speed"
                    value={settings.speed}
                    minimum={2}
                    maximum={4}
                    step={1}
                    unit="ips"
                    onChange={(value) => updateSetting("speed", value)}
                  />
                  <SettingControl
                    id="darkness"
                    label="Darkness"
                    value={settings.darkness}
                    minimum={0}
                    maximum={30}
                    step={1}
                    unit="/30"
                    onChange={(value) => updateSetting("darkness", value)}
                  />
                  <p>Start at 10. Increase it slightly if the print is too light.</p>
                </fieldset>
              </div>
            </section>

            <div className="quantity-row">
              <div>
                <span className="quantity-label">Quantity</span>
                <p>Maximum 100 labels per print job.</p>
              </div>
              <div className="stepper" aria-label="Label quantity">
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(Math.max(1, Math.min(100, Number(event.target.value) || 1)))
                  }
                  aria-label="Quantity"
                />
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.min(100, value + 1))}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>

            <div className="action-row">
              <button className="secondary-button" type="button" onClick={saveZpl}>
                Save ZPL
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={printLabel}
                disabled={printing}
              >
                {printing ? "Sending…" : `Print ${quantity} label${quantity === 1 ? "" : "s"}`}
                <span aria-hidden="true">→</span>
              </button>
            </div>

            {notice && <div className={`notice ${notice.tone}`}>{notice.message}</div>}
          </section>

          <aside className="preview-column">
            <section className="preview-card" aria-labelledby="preview-title">
              <div className="preview-heading">
                <div>
                  <p className="section-kicker">Preview</p>
                  <h2 id="preview-title">Ready to print</h2>
                </div>
                <span className="size-badge">
                  {settings.labelWidthMm} × {settings.labelHeightMm} mm
                </span>
              </div>

              <div className="label-stage">
                <div className="drag-hint">
                  {designMode === "custom" ? "Drag each line, A logo, AnyGold text or code" : "Drag text or code to move"}
                </div>
                <div className="label-paper" style={labelPreviewStyle} ref={labelPaperRef}>
                  {designMode === "custom" && showBrandLogo && (
                    <div
                      className="print-brand-mark draggable-item"
                      role="button"
                      tabIndex={0}
                      aria-label="Move the AnyGold A logo"
                      title="Drag to reposition the A logo"
                      onPointerDown={(event) => startPreviewDrag({ type: "logoMark" }, event)}
                      onPointerMove={movePreviewDrag}
                      onPointerUp={endPreviewDrag}
                      onPointerCancel={endPreviewDrag}
                    >
                      <img src="/anygold-a.png" alt="" aria-hidden="true" />
                    </div>
                  )}
                  {designMode === "custom" && showBrandLogo && (
                    <div
                      className="print-brand-wordmark draggable-item"
                      role="button"
                      tabIndex={0}
                      aria-label="Move the AnyGold text"
                      title="Drag to reposition the AnyGold text"
                      onPointerDown={(event) => startPreviewDrag({ type: "logoWordmark" }, event)}
                      onPointerMove={movePreviewDrag}
                      onPointerUp={endPreviewDrag}
                      onPointerCancel={endPreviewDrag}
                    >
                      AnyGold
                    </div>
                  )}
                  {designMode === "custom" ? (
                    (printLineItems.length
                      ? printLineItems
                      : [{ text: "LABEL", sourceIndex: 0 }]
                    ).map((item) => {
                      const position = customLinePositions[item.sourceIndex]
                        ?? DEFAULT_CUSTOM_LINE_POSITIONS[item.sourceIndex]
                        ?? DEFAULT_CUSTOM_LINE_POSITIONS[0];
                      return (
                        <div
                          key={`preview-line-${item.sourceIndex}`}
                          className={`label-copy custom-line draggable-item ${selectedLineIndex === item.sourceIndex ? "selected" : ""}`}
                          style={{
                            left: `${(position.xMm / settings.labelWidthMm) * 100}%`,
                            top: `${(position.yMm / settings.labelHeightMm) * 100}%`,
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label={`Move text ${item.sourceIndex + 1}: ${item.text}`}
                          title={`Drag text ${item.sourceIndex + 1} separately`}
                          onClick={() => setSelectedLineIndex(item.sourceIndex)}
                          onPointerDown={(event) => startPreviewDrag({ type: "text", index: item.sourceIndex }, event)}
                          onPointerMove={movePreviewDrag}
                          onPointerUp={endPreviewDrag}
                          onPointerCancel={endPreviewDrag}
                        >
                          {item.text}
                        </div>
                      );
                    })
                  ) : (
                    <div
                      className="label-copy draggable-item"
                      title="Drag to reposition text"
                      onPointerDown={(event) => startPreviewDrag({ type: "standardText" }, event)}
                      onPointerMove={movePreviewDrag}
                      onPointerUp={endPreviewDrag}
                      onPointerCancel={endPreviewDrag}
                    >
                      {(printLineItems.length ? printLineItems : [{ text: "LABEL", sourceIndex: 0 }]).map((item) => (
                        <div key={`${item.text}-${item.sourceIndex}`}>{item.text}</div>
                      ))}
                    </div>
                  )}
                  {codeImage && (
                    <img
                      className={`qr-preview ${codeType === "qr" ? "square-code" : "linear-code"}`}
                      src={codeImage}
                      alt={`${activeCodeOption.label} preview for ${qrData}`}
                      draggable={false}
                      title="Drag to reposition code"
                      onPointerDown={(event) => startPreviewDrag({ type: "qr" }, event)}
                      onPointerMove={movePreviewDrag}
                      onPointerUp={endPreviewDrag}
                      onPointerCancel={endPreviewDrag}
                    />
                  )}
                  <div className="tag-guide top" aria-hidden="true" />
                  <div className="tag-guide bottom" aria-hidden="true" />
                </div>
              </div>

              <div className="preview-footer">
                <span>Current print position</span>
                <span>{activeCodeOption.label}: {qrData || "—"}</span>
              </div>
            </section>

            <div className="spec-grid">
              <div className="spec-card">
                <span>Printer</span>
                <strong>ZD421</strong>
                <small>USB002</small>
              </div>
              <div className="spec-card lime">
                <span>Resolution</span>
                <strong>300</strong>
                <small>DPI</small>
              </div>
              <div className="spec-card">
                <span>Print speed</span>
                <strong>{settings.speed}</strong>
                <small>ips · darkness {settings.darkness}</small>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
