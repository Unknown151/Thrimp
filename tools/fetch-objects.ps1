<#
  Downloads every PixelLab object listed in art\pixellab-objects.json ({ "name": "object id" }) to
  art\pixellab-raw\objects\<name>.png, skipping ones already on disk (-Force re-downloads), then copies them
  into assets\objects\ for the game (names ending in -test are experiments and stay out).
  Objects only exist once PixelLab finishes them; unfinished ones are reported and skipped.
  Objects are made with the Endesga 32 palette, so they need no colour snapping.
#>
param([switch]$Force)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$manifest = Get-Content (Join-Path $root 'art\pixellab-objects.json') -Raw | ConvertFrom-Json
$out = Join-Path $root 'art\pixellab-raw\objects'
New-Item -ItemType Directory -Force $out | Out-Null
$base = 'https://backblaze.pixellab.ai/file/pixellab-characters/objects/c16a34af-927e-4300-b7c2-a47c8302eadf'
foreach ($p in $manifest.PSObject.Properties) {
  $file = Join-Path $out "$($p.Name).png"
  if ((Test-Path $file) -and -not $Force) { continue }
  try { Invoke-WebRequest -Uri "$base/$($p.Value)/rotations/unknown.png" -OutFile $file -UseBasicParsing; "fetched $($p.Name)" }
  catch { "not ready: $($p.Name)" }
}
$assets = Join-Path $root 'assets\objects'
New-Item -ItemType Directory -Force $assets | Out-Null
foreach ($p in $manifest.PSObject.Properties) {
  $file = Join-Path $out "$($p.Name).png"
  if ($p.Name -notlike '*-test' -and (Test-Path $file)) { Copy-Item $file (Join-Path $assets "$($p.Name).png") -Force }
}
"installed: $((Get-ChildItem $assets -Filter *.png).Count) object(s) in assets\objects"
