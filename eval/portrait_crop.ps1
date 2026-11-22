# Reproducible evaluation preprocessing only: isolate a single original photo
# from an author's public contact sheet. No generated imagery or retouching.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$portraitCrops=@(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'portrait-cases.json') -Raw | ConvertFrom-Json | Where-Object crop)
foreach($portraitCase in $portraitCrops) {
  $portraitOriginal=[System.Drawing.Bitmap]::FromFile((Join-Path $PSScriptRoot $portraitCase.crop.file))
  try {
    $portraitRect=New-Object System.Drawing.Rectangle($portraitCase.crop.x,$portraitCase.crop.y,$portraitCase.crop.width,$portraitCase.crop.height)
    if($portraitRect.Right -gt $portraitOriginal.Width -or $portraitRect.Bottom -gt $portraitOriginal.Height) {throw "Crop outside original: $($portraitCase.id)"}
    $portraitSingle=$portraitOriginal.Clone($portraitRect,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    try {$portraitSingle.Save((Join-Path $PSScriptRoot $portraitCase.file),[System.Drawing.Imaging.ImageFormat]::Jpeg)} finally {$portraitSingle.Dispose()}
    Write-Output "CROPPED $($portraitCase.id)"
  } finally {$portraitOriginal.Dispose()}
}
