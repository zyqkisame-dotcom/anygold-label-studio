$ErrorActionPreference = 'Stop'
$printerName = 'ZDesigner ZD421CN-300dpi ZPL'
$port = 4210

$rawPrinterSource = @'
using System;
using System.Runtime.InteropServices;

public static class AnygoldWebRawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOC_INFO_1
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool OpenPrinter(string printerName, out IntPtr printerHandle, IntPtr defaults);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr printerHandle);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int StartDocPrinter(IntPtr printerHandle, int level, [In] DOC_INFO_1 docInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr printerHandle);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr printerHandle);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr printerHandle);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr printerHandle, byte[] bytes, int count, out int written);

    public static void Send(string printerName, byte[] bytes)
    {
        IntPtr handle;
        if (!OpenPrinter(printerName, out handle, IntPtr.Zero))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());

        try
        {
            var docInfo = new DOC_INFO_1
            {
                pDocName = "ANYGOLD Web Label Studio",
                pOutputFile = null,
                pDataType = "RAW"
            };

            if (StartDocPrinter(handle, 1, docInfo) == 0)
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());

            try
            {
                if (!StartPagePrinter(handle))
                    throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());

                try
                {
                    int written;
                    if (!WritePrinter(handle, bytes, bytes.Length, out written) || written != bytes.Length)
                        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                }
                finally { EndPagePrinter(handle); }
            }
            finally { EndDocPrinter(handle); }
        }
        finally { ClosePrinter(handle); }
    }
}
'@

Add-Type -TypeDefinition $rawPrinterSource

function ConvertTo-ZplText {
    param([AllowEmptyString()][string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return '' }
    return (($Text.Trim() -replace '[\^~]', ' ') -replace '[\r\n]+', ' ')
}

function Get-SettingNumber {
    param($Settings, [string]$Name, [double]$Default)
    if ($null -eq $Settings) { return $Default }
    $property = $Settings.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) { return $Default }
    try { return [double]$property.Value }
    catch { return $Default }
}

function Limit-Number {
    param([double]$Value, [double]$Minimum, [double]$Maximum)
    return [Math]::Min($Maximum, [Math]::Max($Minimum, $Value))
}

function New-LabelZpl {
    param($Data)

    $isCustom = [string]$Data.designMode -eq 'custom'
    $textItems = [System.Collections.Generic.List[object]]::new()
    if ($isCustom) {
        $sourceLines = @(([string]$Data.customText -split '\r?\n') | Select-Object -First 6)
        for ($sourceIndex = 0; $sourceIndex -lt $sourceLines.Count; $sourceIndex++) {
            $cleanText = ConvertTo-ZplText $sourceLines[$sourceIndex]
            if ($cleanText -ne '') {
                $textItems.Add([PSCustomObject]@{ Text = $cleanText; SourceIndex = $sourceIndex })
            }
        }
    }
    else {
        $sourceLines = @(
            ([string]$Data.company)
            ([string]$Data.productName)
            ([string]$Data.productCode)
            ([string]$Data.tagNumber)
        )
        for ($sourceIndex = 0; $sourceIndex -lt $sourceLines.Count; $sourceIndex++) {
            $cleanText = ConvertTo-ZplText $sourceLines[$sourceIndex]
            if ($cleanText -ne '') {
                $textItems.Add([PSCustomObject]@{ Text = $cleanText; SourceIndex = $sourceIndex })
            }
        }
    }

    if ($textItems.Count -eq 0) {
        $textItems.Add([PSCustomObject]@{ Text = 'LABEL'; SourceIndex = 0 })
    }

    $quantity = [Math]::Max(1, [Math]::Min(100, [int]$Data.quantity))
    $settings = $Data.settings
    $dotsPerMm = 300.0 / 25.4
    $labelWidthMm = Limit-Number (Get-SettingNumber $settings 'labelWidthMm' 70) 20 104
    $labelHeightMm = Limit-Number (Get-SettingNumber $settings 'labelHeightMm' 35) 10 200
    $labelWidth = [int][Math]::Round($labelWidthMm * $dotsPerMm)
    $labelHeight = [int][Math]::Round($labelHeightMm * $dotsPerMm)
    $textX = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'textXmm' 5) 0 $labelWidthMm) * $dotsPerMm)
    $textY = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'textYmm' 7.5) 0 $labelHeightMm) * $dotsPerMm)
    $qrX = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'qrXmm' 17.5) 0 $labelWidthMm) * $dotsPerMm)
    $qrY = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'qrYmm' 7) 0 $labelHeightMm) * $dotsPerMm)
    $logoX = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'logoXmm' 5) 0 $labelWidthMm) * $dotsPerMm)
    $logoY = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'logoYmm' 4) 0 $labelHeightMm) * $dotsPerMm)
    $logoHeight = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'logoSize' 30) 18 60))
    $logoWidth = [int][Math]::Round($logoHeight * 0.82)
    $fontHeight = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'textSize' 28) 12 60))
    $fontWidth = [int][Math]::Round($fontHeight * 0.86)
    $lineStep = [int][Math]::Round($fontHeight * 1.18)
    $qrSize = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'qrSize' 4) 2 10))
    $moduleWidth = [int][Math]::Round((Limit-Number ($qrSize / 2.0) 1 4))
    $barcodeHeight = [int][Math]::Round(38 + ($qrSize * 10))
    $speed = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'speed' 2) 2 4))
    $darkness = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'darkness' 10) 0 30))

    $zpl = [System.Collections.Generic.List[string]]::new()
    $zpl.Add(('~SD{0:00}' -f $darkness))
    $zpl.Add('^XA')
    $zpl.Add("^PW$labelWidth")
    $zpl.Add("^LL$labelHeight")
    $zpl.Add('^LH0,0')
    $zpl.Add('^LT0')
    $zpl.Add('^LS0')
    $zpl.Add('^MNY')
    $zpl.Add("^PR$speed")

    if ([bool]$Data.showBrandLogo) {
        $zpl.Add("^FO$logoX,$logoY^A0N,$logoHeight,$logoWidth^FDAnyGold^FS")
    }

    $customLinePositions = @($Data.customLinePositions)
    for ($index = 0; $index -lt $textItems.Count; $index++) {
        $x = $textX
        $y = $textY + ($index * $lineStep)
        if ($isCustom) {
            $sourceIndex = [int]$textItems[$index].SourceIndex
            $defaultYmm = 7.5 + ($sourceIndex * 3.0)
            if ($sourceIndex -lt $customLinePositions.Count -and $null -ne $customLinePositions[$sourceIndex]) {
                $xMm = Limit-Number (Get-SettingNumber $customLinePositions[$sourceIndex] 'xMm' 5) 0 $labelWidthMm
                $yMm = Limit-Number (Get-SettingNumber $customLinePositions[$sourceIndex] 'yMm' $defaultYmm) 0 $labelHeightMm
            }
            else {
                $xMm = Limit-Number 5 0 $labelWidthMm
                $yMm = Limit-Number $defaultYmm 0 $labelHeightMm
            }
            $x = [int][Math]::Round($xMm * $dotsPerMm)
            $y = [int][Math]::Round($yMm * $dotsPerMm)
        }
        $zpl.Add("^FO$x,$y^A0N,$fontHeight,$fontWidth^FD$($textItems[$index].Text)^FS")
    }

    $qrData = ConvertTo-ZplText ([string]$Data.qrData)
    $codeType = ([string]$Data.codeType).ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($codeType)) { $codeType = 'qr' }
    if ($qrData -ne '' -and $codeType -ne 'none') {
        switch ($codeType) {
            'code128' {
                $zpl.Add("^FO$qrX,$qrY^BY$moduleWidth,2,$barcodeHeight^BCN,$barcodeHeight,N,N,N,A^FD$qrData^FS")
            }
            'ean13' {
                if ($qrData -notmatch '^\d{12}$') { throw 'EAN-13 requires exactly 12 digits.' }
                $zpl.Add("^FO$qrX,$qrY^BY$moduleWidth,2,$barcodeHeight^BEN,$barcodeHeight,Y,N^FD$qrData^FS")
            }
            default {
                $zpl.Add("^FO$qrX,$qrY^BQN,2,$qrSize^FDLA,$qrData^FS")
            }
        }
    }

    $zpl.Add("^PQ$quantity,0,1,Y")
    $zpl.Add('^XZ')
    return [string]::Join([Environment]::NewLine, $zpl)
}

function Send-HttpResponse {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [int]$StatusCode,
        [string]$StatusText,
        [string]$Json,
        [string]$Origin
    )

    $body = [System.Text.Encoding]::UTF8.GetBytes($Json)
    $headers = @(
        "HTTP/1.1 $StatusCode $StatusText"
        'Content-Type: application/json; charset=utf-8'
        "Content-Length: $($body.Length)"
        "Access-Control-Allow-Origin: $Origin"
        'Access-Control-Allow-Methods: GET, POST, OPTIONS'
        'Access-Control-Allow-Headers: Content-Type'
        'Connection: close'
        ''
        ''
    )
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes([string]::Join([Environment]::NewLine, $headers))
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($body.Length -gt 0) {
        $Stream.Write($body, 0, $body.Length)
    }
    $Stream.Flush()
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
$listener.Start()

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8, $false, 8192, $true)
            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

            $requestParts = $requestLine.Split(' ')
            $method = $requestParts[0].ToUpperInvariant()
            $path = $requestParts[1].Split('?')[0]
            $contentLength = 0
            $origin = 'http://localhost:3000'

            while ($true) {
                $line = $reader.ReadLine()
                if ([string]::IsNullOrEmpty($line)) { break }
                $separator = $line.IndexOf(':')
                if ($separator -gt 0) {
                    $name = $line.Substring(0, $separator).Trim()
                    $value = $line.Substring($separator + 1).Trim()
                    if ($name -ieq 'Content-Length') { $contentLength = [int]$value }
                    if ($name -ieq 'Origin' -and $value -in @('http://localhost:3000', 'http://127.0.0.1:3000')) {
                        $origin = $value
                    }
                }
            }

            if ($method -eq 'OPTIONS') {
                Send-HttpResponse -Stream $stream -StatusCode 204 -StatusText 'No Content' -Json '' -Origin $origin
                continue
            }

            if ($method -eq 'GET' -and $path -eq '/status') {
                $printer = Get-Printer -Name $printerName -ErrorAction SilentlyContinue
                if ($printer) {
                    $json = @{ online = $true; printer = $printerName; status = [string]$printer.PrinterStatus } | ConvertTo-Json -Compress
                    Send-HttpResponse -Stream $stream -StatusCode 200 -StatusText 'OK' -Json $json -Origin $origin
                }
                else {
                    $json = @{ online = $false; message = 'Printer not found' } | ConvertTo-Json -Compress
                    Send-HttpResponse -Stream $stream -StatusCode 503 -StatusText 'Service Unavailable' -Json $json -Origin $origin
                }
                continue
            }

            if ($method -eq 'POST' -and $path -eq '/print') {
                $buffer = New-Object char[] $contentLength
                $read = 0
                while ($read -lt $contentLength) {
                    $count = $reader.Read($buffer, $read, ($contentLength - $read))
                    if ($count -le 0) { break }
                    $read += $count
                }

                $payload = (-join $buffer[0..([Math]::Max(0, $read - 1))]) | ConvertFrom-Json
                if (-not (Get-Printer -Name $printerName -ErrorAction SilentlyContinue)) {
                    throw "Printer not found: $printerName"
                }

                $zpl = New-LabelZpl $payload
                $lastLabel = Join-Path $PSScriptRoot 'LAST-WEB-LABEL.zpl'
                [System.IO.File]::WriteAllText($lastLabel, $zpl, [System.Text.Encoding]::ASCII)
                [AnygoldWebRawPrinter]::Send($printerName, [System.Text.Encoding]::ASCII.GetBytes($zpl))

                $json = @{ success = $true; quantity = [int]$payload.quantity } | ConvertTo-Json -Compress
                Send-HttpResponse -Stream $stream -StatusCode 200 -StatusText 'OK' -Json $json -Origin $origin
                continue
            }

            Send-HttpResponse -Stream $stream -StatusCode 404 -StatusText 'Not Found' -Json '{"message":"Not found"}' -Origin $origin
        }
        catch {
            try {
                $json = @{ message = $_.Exception.Message } | ConvertTo-Json -Compress
                Send-HttpResponse -Stream $stream -StatusCode 500 -StatusText 'Internal Server Error' -Json $json -Origin 'http://localhost:3000'
            }
            catch {}
        }
        finally {
            $client.Close()
        }
    }
}
finally {
    $listener.Stop()
}
