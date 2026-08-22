$ErrorActionPreference = 'Stop'
$nodeBin = 'C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'
$env:Path = $nodeBin + ';' + $env:Path
$env:WRANGLER_LOG_PATH = '.wrangler/wrangler.log'
Set-Location -LiteralPath $PSScriptRoot
& '.\node_modules\.bin\vinext.cmd' dev
