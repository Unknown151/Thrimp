<#
  Downloads one direction of a PixelLab animation into art\pixellab-raw\<character>\<animation>\<direction>\<i>.png.

  -Url is the frame URL template get_character prints, with {i} where the frame number goes.
  Example:
    .\tools\fetch-frames.ps1 -Out art\pixellab-raw\thrimp-endesga32\gather -Direction north -Count 5 `
                             -Url 'https://backblaze.pixellab.ai/.../north/{i}.png?t=123'
#>
param(
  [Parameter(Mandatory)] [string]$Out,
  [Parameter(Mandatory)] [string]$Direction,
  [Parameter(Mandatory)] [int]$Count,
  [Parameter(Mandatory)] [string]$Url
)
$ErrorActionPreference = 'Stop'
$dir = Join-Path $Out $Direction
New-Item -ItemType Directory -Force $dir | Out-Null
for ($i = 0; $i -lt $Count; $i++) {
  Invoke-WebRequest -Uri $Url.Replace('{i}', "$i") -OutFile (Join-Path $dir "$i.png") -UseBasicParsing
}
"$Direction : $Count frame(s) -> $dir"
