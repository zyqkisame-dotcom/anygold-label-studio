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

$anyGoldMarkSourceWidth = 128
$anyGoldMarkSourceHeight = 128
$anyGoldMarkBytes = [Convert]::FromBase64String('AAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAPAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAAAAAAAAAAAB+AAAAAAAAAAAAAAAAAAAAfgAAAAAAAAAAAAAAAAAAAP8AAAAAAAAAAAAAAAAAAAD/AAAAAAAAAAAAAAAAAAAB/4AAAAAAAAAAAAAAAAAAAf+AAAAAAAAAAAAAAAAAAAP/gAAAAAAAAAAAAAAAAAAD/8AAAAAAAAAAAAAAAAAAB//AAAAAAAAAAAAAAAAAAAf/4AAAAAAAAAAAAAAAAAAP/+AAAAAAAAAAAAAAAAAAD//wAAAAAAAAAAAAAAAAAA//8AAAAAAAAAAAAAAAAAAf//gAAAAAAAAAAAAAAAAAH//4AAAAAAAAAAAAAAAAAD///AAAAAAAAAAAAAAAAAA///wAAAAAAAAAAAAAAAAAf//+AAAAAAAAAAAAAAAAAH///gAAAAAAAAAAAAAAAAD///4AAAAAAAAAAAAAAAAA////AAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAH///+AAAAAAAAAAAAAAAAD////gAAAAAAAAAAAAAAAA////8AAAAAAAAAAAAAAAAP////AAAAAAAAAAAAAAAAH////4AAAAAAAAAAAAAAAB////+AAAAAAAAAAAAAAAA/////wAAAAAAAAAAAAAAAP////8AAAAAAAAAAAAAAAH/////gAAAAAAAAAAAAAAB/////4AAAAAAAAAAAAAAA/////+AAAAAAAAAAAAAAAP/////wAAAAAAAAAAAAAAH/////8AAAAAAAAAAAAAAB//////gAAAAAAAAAAAAAAf/////4AAAAAAAAAAAAAAP//////AAAAAAAAAAAAAAD//////wAAAAAAAAAAAAAB//////+AAAAAAAAAAAAAAf//////gAAAAAAAAAAAAAP//////8AAAAAAAAAAAAAD///////AAAAAAAAAAAAAB///////wAAAAAAAAAAAAAf//////+AAAAAAAAAAAAAP///////gAAAAAAAAAAAAD///////8AAAAAAAAAAAAB////////AAAAAAAAAAAAAf///////4AAAAAAAAAAAAH///////+AAAAAAAAAAAAD////////wAAAAAAAAAAAA////////8AAAAAAAAAAAAf////////gAAAAAAAAAAAH////////4AAAAAAAAAAAD/////////AAAAAAAAAAAA/////////wAAAAAAAAAAAf////////8AAAAAAAAAAAH/////////gAAAAAAAAAAD/////////4AAAAAAAAAAA//////////AAAAAAAAAAAf/////////wAAAAAAAAAAH/////////+AAAAAAAAAAB//////////gAAAAAAAAAA//////////8AAAAAAAAAAP//////////AAAAAAAAAAH//////////4AAAAAAAAAB///5//////+AAAAAAAAAA///+H//////wAAAAAAAAAP///gf/////8AAAAAAAAAH///wD//////AAAAAAAAAB///8AP/////4AAAAAAAAA///+AA/////+AAAAAAAAAP///gAD/////wAAAAAAAAH///wAAf////8AAAAAAAAB///8AAB/////gAAAAAAAAf///AAAH////4AAAAAAAAP///gAAAf////AAAAAAAAD///4AAAD////wAAAAAAAB///8AAAAP///+AAAAAAAAf///AAAAA////gAAAAAAAP///gAAAAH///8AAAAAAAD///4AAAAAf///AAAAAAAB///+AAAAAH///wAAAAAAAf///AAAAAA///+AAAAAAAP///wAAAAAP///gAAAAAAD///4AAAAAD///8AAAAAAA///+AAAAAAf///AAAAAAAf///gAAAAAH///4AAAAAAH///wAAAAAA///+AAAAAAD///8AAAAAAP///wAAAAAA///+AAAAAAD///8AAAAAAf///gAAAAAAf///gAAAAAH///wAAAAAAH///4AAAAAD///8AAAAAAA////AAAAAA////AAAAAAAP///wAAAAAf///gAAAAAAB///8AAAAAH///4AAAAAAAAAAAAAAAAD///8AAAAAAAAAAAAAAAAA////AAAAAAAAAAAAAAAAAP///gAAAAAAAAAAAAAAAAH///4AAAAAAAAAAAAAAAAB///+AAAAAAAAAAAAAAAAA////AAAAAAAAAAAAAAAAAP///wAAAAAAAAAAAAAAAAH///4AAAAAAAAAAAAAAAAB///+AAAAAAAAAAAAAAAAA////gAAAAAAAAAAAAAAAAP///wAAAAAAAAAAAAAAAAH///8AAAAAAAAAAAAAAAAB///+AAAAAAAAAAAAAAAAA////gAAAAAAAAAAAAAAAAP///wAAAAAAAAAAAAAAAAD///8AAAAAAAAAAAAAAAAB////AAAAAAAAAAAAAAAAAf///gAAAAAAAAAAAAAAAAP///4AAAAAAAAAAAAAAAAD///8AAAAAAAAAAAAAAAAB////AAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAP///4AAAAAAAAAAAAAAAAD///+AAAAAAAAAAAAAAAAB////AAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAA=')

function New-MonochromeGraphic {
    param(
        [int]$X,
        [int]$Y,
        [int]$TargetWidth,
        [int]$TargetHeight,
        [byte[]]$SourceBytes,
        [int]$SourceWidth,
        [int]$SourceHeight
    )

    $width = [Math]::Max(1, $TargetWidth)
    $height = [Math]::Max(1, $TargetHeight)
    $bytesPerRow = [int][Math]::Ceiling($width / 8.0)
    $sourceBytesPerRow = [int][Math]::Ceiling($SourceWidth / 8.0)
    $hex = [System.Text.StringBuilder]::new()

    for ($targetY = 0; $targetY -lt $height; $targetY++) {
        $sourceTop = [int][Math]::Floor(($targetY * $SourceHeight) / $height)
        $sourceBottom = [Math]::Max($sourceTop + 1, [int][Math]::Ceiling((($targetY + 1) * $SourceHeight) / $height))

        for ($byteIndex = 0; $byteIndex -lt $bytesPerRow; $byteIndex++) {
            $byteValue = 0
            for ($bit = 0; $bit -lt 8; $bit++) {
                $targetX = ($byteIndex * 8) + $bit
                $byteValue = $byteValue -shl 1
                if ($targetX -lt $width) {
                    $sourceLeft = [int][Math]::Floor(($targetX * $SourceWidth) / $width)
                    $sourceRight = [Math]::Max($sourceLeft + 1, [int][Math]::Ceiling((($targetX + 1) * $SourceWidth) / $width))
                    $blackPixels = 0
                    $sampledPixels = 0

                    for ($sourceY = $sourceTop; $sourceY -lt [Math]::Min($SourceHeight, $sourceBottom); $sourceY++) {
                        for ($sourceX = $sourceLeft; $sourceX -lt [Math]::Min($SourceWidth, $sourceRight); $sourceX++) {
                            $sourceByte = $SourceBytes[($sourceY * $sourceBytesPerRow) + [int][Math]::Floor($sourceX / 8.0)]
                            $blackPixels += (($sourceByte -shr (7 - ($sourceX % 8))) -band 1)
                            $sampledPixels += 1
                        }
                    }

                    if (($blackPixels / [Math]::Max(1, $sampledPixels)) -ge 0.4) {
                        $byteValue = $byteValue -bor 1
                    }
                }
            }
            [void]$hex.Append($byteValue.ToString('X2'))
        }
    }

    $totalBytes = $bytesPerRow * $height
    return "^FO$X,$Y^GFA,$totalBytes,$totalBytes,$bytesPerRow,$($hex.ToString())^FS"
}

function New-AnyGoldMarkGraphic {
    param([int]$X, [int]$Y, [int]$RequestedSize)

    $size = [int][Math]::Round((Limit-Number $RequestedSize 12 90))
    return New-MonochromeGraphic -X $X -Y $Y -TargetWidth $size -TargetHeight $size -SourceBytes $anyGoldMarkBytes -SourceWidth $anyGoldMarkSourceWidth -SourceHeight $anyGoldMarkSourceHeight
}

function New-AnyGoldFullGraphic {
    param([int]$X, [int]$Y, [int]$RequestedWidth)

    $width = [int][Math]::Round((Limit-Number $RequestedWidth 60 360))
    $height = [Math]::Max(12, [int][Math]::Round($width / 4.22))
    $markSize = $height
    $textX = $X + [int][Math]::Round($height * 0.88)
    $textHeight = [Math]::Max(12, [int][Math]::Round($height * 0.78))
    $textY = $Y + [int][Math]::Round(($height - $textHeight) / 2.0)
    $textWidth = [Math]::Max(7, [int][Math]::Round(($width - ($textX - $X)) / 7.0))
    $markGraphic = New-AnyGoldMarkGraphic -X $X -Y $Y -RequestedSize $markSize
    return "$markGraphic`r`n^FO$textX,$textY^A0N,$textHeight,$textWidth^FDAnyGold^FS"
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
    $logoX = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'logoXmm' 9) 0 $labelWidthMm) * $dotsPerMm)
    $logoY = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'logoYmm' 4.5) 0 $labelHeightMm) * $dotsPerMm)
    $logoHeight = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'logoSize' 30) 12 72))
    $logoWidth = [int][Math]::Round($logoHeight * 0.82)
    $markX = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'markXmm' 5) 0 $labelWidthMm) * $dotsPerMm)
    $markY = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'markYmm' 4) 0 $labelHeightMm) * $dotsPerMm)
    $markSize = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'markSize' 38) 12 90))
    $fullLogoX = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'fullLogoXmm' 5) 0 $labelWidthMm) * $dotsPerMm)
    $fullLogoY = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'fullLogoYmm' 4) 0 $labelHeightMm) * $dotsPerMm)
    $fullLogoWidth = [int][Math]::Round((Limit-Number (Get-SettingNumber $settings 'fullLogoWidth' 190) 60 360))
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
        $brandLogoTypes = [System.Collections.Generic.List[string]]::new()
        foreach ($logoType in @($Data.brandLogoTypes)) {
            $value = [string]$logoType
            if ($value -in @('mark', 'full', 'wordmark') -and -not $brandLogoTypes.Contains($value)) {
                $brandLogoTypes.Add($value)
            }
        }
        if ($brandLogoTypes.Count -eq 0) {
            $legacyLogoType = [string]$Data.brandLogoType
            if ($legacyLogoType -eq 'mark' -or $legacyLogoType -eq 'full') {
                $brandLogoTypes.Add($legacyLogoType)
            }
            else {
                $brandLogoTypes.Add('mark')
                $brandLogoTypes.Add('wordmark')
            }
        }

        if ($brandLogoTypes.Contains('mark')) {
            $zpl.Add((New-AnyGoldMarkGraphic -X $markX -Y $markY -RequestedSize $markSize))
        }
        if ($brandLogoTypes.Contains('full')) {
            $zpl.Add((New-AnyGoldFullGraphic -X $fullLogoX -Y $fullLogoY -RequestedWidth $fullLogoWidth))
        }
        if ($brandLogoTypes.Contains('wordmark')) {
            $zpl.Add("^FO$logoX,$logoY^A0N,$logoHeight,$logoWidth^FDAnyGold^FS")
        }
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
        'Access-Control-Allow-Private-Network: true'
        'Access-Control-Max-Age: 600'
        'Cache-Control: no-store'
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
$allowedOrigins = @(
    'http://localhost:3000'
    'http://127.0.0.1:3000'
    'https://anygold-label-studio.zyqkisame.chatgpt.site'
)

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $client.ReceiveTimeout = 2500
            $client.SendTimeout = 2500
            $stream = $client.GetStream()
            $stream.ReadTimeout = 2500
            $stream.WriteTimeout = 2500
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8, $false, 8192, $true)
            $origin = 'null'
            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

            $requestParts = $requestLine.Split(' ')
            $method = $requestParts[0].ToUpperInvariant()
            $path = $requestParts[1].Split('?')[0]
            $contentLength = 0

            while ($true) {
                $line = $reader.ReadLine()
                if ([string]::IsNullOrEmpty($line)) { break }
                $separator = $line.IndexOf(':')
                if ($separator -gt 0) {
                    $name = $line.Substring(0, $separator).Trim()
                    $value = $line.Substring($separator + 1).Trim()
                    if ($name -ieq 'Content-Length') { $contentLength = [int]$value }
                    if ($name -ieq 'Origin' -and $value -in $allowedOrigins) {
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
                Send-HttpResponse -Stream $stream -StatusCode 500 -StatusText 'Internal Server Error' -Json $json -Origin $origin
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
