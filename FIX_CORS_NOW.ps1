# Emergency CORS Fix Script - Run this NOW
# This will configure CORS on your GCS bucket

$BUCKET_NAME = "image_labeling"

Write-Host "🚨 EMERGENCY CORS FIX - Configuring CORS for $BUCKET_NAME" -ForegroundColor Red
Write-Host ""

# Check if gsutil is available
$gsutil = Get-Command gsutil -ErrorAction SilentlyContinue

if (-not $gsutil) {
    Write-Host "❌ gsutil not found. Please configure CORS manually:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Go to: https://console.cloud.google.com/storage/browser/$BUCKET_NAME" -ForegroundColor Cyan
    Write-Host "2. Click 'Permissions' tab" -ForegroundColor Cyan
    Write-Host "3. Click 'Edit CORS configuration'" -ForegroundColor Cyan
    Write-Host "4. Paste this JSON:" -ForegroundColor Cyan
    Write-Host '[{"origin":["*"],"method":["GET","HEAD"],"responseHeader":["Content-Type","Access-Control-Allow-Origin"],"maxAgeSeconds":3600}]' -ForegroundColor White
    Write-Host "5. Click Save" -ForegroundColor Cyan
    exit 1
}

# Create CORS config with proper UTF-8 encoding (no BOM)
$corsConfig = '[{"origin":["*"],"method":["GET","HEAD"],"responseHeader":["Content-Type","Access-Control-Allow-Origin"],"maxAgeSeconds":3600}]'
$tempFile = "$env:TEMP\cors-emergency.json"

# Use UTF8NoBOM encoding to avoid the ÿþ BOM issue
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($tempFile, $corsConfig, $utf8NoBom)

Write-Host "📄 Applying CORS configuration..." -ForegroundColor Yellow
& gsutil cors set $tempFile "gs://$BUCKET_NAME"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ CORS configured successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verifying..." -ForegroundColor Yellow
    & gsutil cors get "gs://$BUCKET_NAME"
    Write-Host ""
    Write-Host "🎉 DONE! Now:" -ForegroundColor Green
    Write-Host "1. Wait 30 seconds" -ForegroundColor Yellow
    Write-Host "2. Restart: npm run dev:all" -ForegroundColor Yellow
    Write-Host "3. Clear browser cache (Ctrl+Shift+Delete)" -ForegroundColor Yellow
} else {
    Write-Host "❌ Failed. Configure manually in console (see instructions above)" -ForegroundColor Red
}

Remove-Item $tempFile -ErrorAction SilentlyContinue

