<#
  Builds a game sprite sheet from PixelLab frames and snaps every pixel to Endesga 32.

  Input folder layout (as downloaded from PixelLab), either:
    <Frames>\<direction>.png            one frame per direction (rotations / idle)
    <Frames>\<direction>\<i>.png        an animation, frames 0..n-1
  Output: one PNG, a row per direction in the game's SHEET_DIRS order, a column per frame.

  -PaletteFrom: a folder of reference frames (e.g. the character's rotations). Snapping then only uses the
  Endesga colours found there, so an animation that drifted (a brown tunic turning red) is pulled back to
  the character's own colours.

  Example:
    .\tools\build-sheet.ps1 -Frames art\pixellab-raw\thrimp-endesga32\walk -Out public\assets\thrimp\walk.png `
                            -PaletteFrom art\pixellab-raw\thrimp-endesga32\rotations
#>
param(
  [Parameter(Mandatory)] [string]$Frames,
  [Parameter(Mandatory)] [string]$Out,
  [string]$PaletteFrom
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# Must match SHEET_DIRS in public/index.html.
$dirs = 'south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'
# Endesga 32, the palette all Thrimp art is locked to.
$palette = 'be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633 e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e 124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466 262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569'.Split(' ') |
  ForEach-Object { , @([Convert]::ToInt32($_.Substring(0, 2), 16), [Convert]::ToInt32($_.Substring(2, 2), 16), [Convert]::ToInt32($_.Substring(4, 2), 16)) }

if ($PaletteFrom) {
  $seen = @{}
  foreach ($f in Get-ChildItem $PaletteFrom -Filter *.png -Recurse) {
    $img = [System.Drawing.Bitmap]::FromFile($f.FullName)
    for ($y = 0; $y -lt $img.Height; $y++) { for ($x = 0; $x -lt $img.Width; $x++) { $p = $img.GetPixel($x, $y); if ($p.A -ge 128) { $seen[$p.ToArgb() -band 0xFFFFFF] = $true } } }
    $img.Dispose()
  }
  $palette = @($palette | Where-Object { $seen.ContainsKey(($_[0] -shl 16) -bor ($_[1] -shl 8) -bor $_[2]) })
  if ($palette.Count -lt 2) { throw "No Endesga 32 colours found in $PaletteFrom" }
  "Snapping to the $($palette.Count) Endesga colours used in $PaletteFrom"
}

$cache = @{}
# Nearest palette colour by "redmean" distance, a cheap approximation of how the eye compares colours.
function Snap($px) {
  $key = $px.ToArgb() -band 0xFFFFFF # (not R -shl 16: PowerShell keeps that a byte, which wraps to 0)
  if ($cache.ContainsKey($key)) { return $cache[$key] }
  $best = $null; $bestD = [double]::MaxValue
  foreach ($c in $palette) {
    $rm = ($px.R + $c[0]) / 2; $dr = $px.R - $c[0]; $dg = $px.G - $c[1]; $db = $px.B - $c[2]
    $d = (2 + $rm / 256) * $dr * $dr + 4 * $dg * $dg + (2 + (255 - $rm) / 256) * $db * $db
    if ($d -lt $bestD) { $bestD = $d; $best = $c }
  }
  $cache[$key] = [System.Drawing.Color]::FromArgb(255, $best[0], $best[1], $best[2])
  return $cache[$key]
}

$rows = foreach ($d in $dirs) {
  $single = Join-Path $Frames "$d.png"
  if (Test-Path $single) { , @($single) }
  else {
    $dirPath = Join-Path $Frames $d
    $files = if (Test-Path $dirPath) { Get-ChildItem $dirPath -Filter *.png | Sort-Object { [int]$_.BaseName } | ForEach-Object FullName }
    if (-not $files) { Write-Host "  no frames for ${d}: its row stays empty and the game falls back for that direction"; , @() }
    else { , @($files) }
  }
}
$first = $rows | Where-Object { $_.Count } | Select-Object -First 1
if (-not $first) { throw "No frames found in $Frames" }
$cols = ($rows | ForEach-Object { $_.Count } | Measure-Object -Maximum).Maximum
# Custom (v3) animations come back on canvases sized per direction (40 px south, 44 px east...). The cell is the
# largest of them; smaller frames are centred in it. The game finds each direction's feet from the pixels anyway.
$size = 0
foreach ($row in $rows) { foreach ($f in $row) { $probe = [System.Drawing.Bitmap]::FromFile($f); $size = [Math]::Max($size, [Math]::Max($probe.Width, $probe.Height)); $probe.Dispose() } }

$sheet = New-Object System.Drawing.Bitmap ($size * $cols), ($size * $dirs.Count), ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$snapped = 0
for ($r = 0; $r -lt $dirs.Count; $r++) {
  for ($c = 0; $c -lt $rows[$r].Count; $c++) {
    $img = [System.Drawing.Bitmap]::FromFile($rows[$r][$c])
    $ox = [Math]::Floor(($size - $img.Width) / 2); $oy = [Math]::Floor(($size - $img.Height) / 2)
    for ($y = 0; $y -lt $img.Height; $y++) {
      for ($x = 0; $x -lt $img.Width; $x++) {
        $px = $img.GetPixel($x, $y)
        if ($px.A -lt 128) { continue } # crisp edges: no half-transparent pixels
        $col = Snap $px
        if ($col.ToArgb() -ne $px.ToArgb()) { $snapped++ }
        $sheet.SetPixel($c * $size + $ox + $x, $r * $size + $oy + $y, $col)
      }
    }
    $img.Dispose()
  }
}
New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
$sheet.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
"$Out : $cols frame(s) x $($dirs.Count) directions at ${size}px, $snapped pixel(s) snapped to Endesga 32"
