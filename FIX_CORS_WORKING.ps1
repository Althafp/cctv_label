# WORKING CORS Fix - Proper UTF-8 encoding
# Run this in PowerShell

$BUCKET_NAME = "image_labeling"
$corsConfig = '[{"origin":["*"],"method":["GET","HEAD"],"responseHeader":["Content-Type","Access-Control-Allow-Origin"],"maxAgeSeconds":3600}]'
$tempFile = "cors.json"

Write-Host "🚨 Fixing CORS for $BUCKET_NAME" -ForegroundColor Yellow
Write-Host ""

# Create file with UTF-8 without BOM (this fixes the ÿþ issue)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($tempFile, $corsConfig, $utf8NoBom)

Write-Host "✅ Created cors.json with proper encoding" -ForegroundColor Green
Write-Host ""

# Check if gsutil exists
$gsutil = Get-Command gsutil -ErrorAction SilentlyContinue

if (-not $gsutil) {
    Write-Host "❌ gsutil not found. Use Google Cloud Console instead:" -ForegroundColor Red
    Write-Host "https://console.cloud.google.com/storage/browser/$BUCKET_NAME" -ForegroundColor Cyan
    Write-Host "Permissions → Edit CORS configuration → Paste the JSON from cors.json"
    exit 1
}

Write-Host "📤 Applying CORS configuration..." -ForegroundColor Yellow
& gsutil cors set $tempFile "gs://$BUCKET_NAME"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ CORS configured successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verifying..." -ForegroundColor Yellow
    & gsutil cors get "gs://$BUCKET_NAME"
    Write-Host ""
    Write-Host "🎉 DONE! Now:" -ForegroundColor Green
    Write-Host "1. Wait 30 seconds for propagation" -ForegroundColor Yellow
    Write-Host "2. Restart: npm run dev:all" -ForegroundColor Yellow
    Write-Host "3. Clear browser cache (Ctrl+Shift+Delete)" -ForegroundColor Yellow
} else {
    Write-Host "❌ Failed. Try Google Cloud Console method:" -ForegroundColor Red
    Write-Host "https://console.cloud.google.com/storage/browser/$BUCKET_NAME → Permissions → Edit CORS"
    Write-Host "Paste this JSON:" -ForegroundColor Yellow
    Write-Host $corsConfig -ForegroundColor White
}

# Cleanup
Remove-Item $tempFile -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "Script complete!" -ForegroundColor Green

