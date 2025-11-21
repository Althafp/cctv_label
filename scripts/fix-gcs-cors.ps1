# PowerShell script to fix GCS CORS configuration
# Run this after uploading images to GCS

$BUCKET_NAME = "image_labeling"

Write-Host "🔧 Setting up CORS for GCS bucket: $BUCKET_NAME" -ForegroundColor Cyan
Write-Host ""

# Create CORS config
$corsConfig = @"
[
  {
    "origin": ["http://localhost:5173", "http://localhost:3000", "http://localhost:5174", "http://127.0.0.1:5173"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"],
    "maxAgeSeconds": 3600
  }
]
"@

$tempFile = "$env:TEMP\cors-config.json"
$corsConfig | Out-File -FilePath $tempFile -Encoding UTF8

Write-Host "📄 CORS configuration created at: $tempFile" -ForegroundColor Green
Write-Host ""
Write-Host "Applying CORS to bucket..." -ForegroundColor Yellow

# Check if gsutil is available
$gsutilPath = Get-Command gsutil -ErrorAction SilentlyContinue

if (-not $gsutilPath) {
    Write-Host "❌ gsutil not found. Please install Google Cloud SDK:" -ForegroundColor Red
    Write-Host "   https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or configure CORS manually in Google Cloud Console:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://console.cloud.google.com/storage/browser/$BUCKET_NAME" -ForegroundColor Cyan
    Write-Host "2. Click 'Edit CORS configuration'" -ForegroundColor Cyan
    Write-Host "3. Paste the JSON from: $tempFile" -ForegroundColor Cyan
    exit 1
}

# Apply CORS
& gsutil cors set $tempFile "gs://$BUCKET_NAME"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ CORS configuration applied successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verifying CORS configuration..." -ForegroundColor Yellow
    & gsutil cors get "gs://$BUCKET_NAME"
} else {
    Write-Host "❌ Failed to apply CORS configuration" -ForegroundColor Red
    Write-Host "Make sure you're authenticated: gcloud auth login" -ForegroundColor Yellow
}

# Cleanup
Remove-Item $tempFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "1. Make bucket publicly readable:" -ForegroundColor Yellow
Write-Host "   gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME" -ForegroundColor White
Write-Host ""
Write-Host "2. Regenerate manifest:" -ForegroundColor Yellow
Write-Host "   npm run generate-gcs-manifest" -ForegroundColor White
Write-Host ""
Write-Host "3. Restart dev server:" -ForegroundColor Yellow
Write-Host "   npm run dev:all" -ForegroundColor White
Write-Host ""
Write-Host "4. Clear browser cache (Ctrl+Shift+Delete) and reload" -ForegroundColor Yellow

