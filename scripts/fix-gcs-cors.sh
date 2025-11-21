#!/bin/bash
# Quick script to fix GCS CORS configuration

BUCKET_NAME="image_labeling"

echo "🔧 Setting up CORS for GCS bucket: $BUCKET_NAME"
echo ""

# Create temporary CORS config file
cat > /tmp/cors-config.json << 'EOF'
[
  {
    "origin": ["http://localhost:5173", "http://localhost:3000", "http://localhost:5174", "http://127.0.0.1:5173"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"],
    "maxAgeSeconds": 3600
  }
]
EOF

echo "📄 CORS configuration created"
echo ""
echo "Applying CORS to bucket..."
gsutil cors set /tmp/cors-config.json gs://$BUCKET_NAME

if [ $? -eq 0 ]; then
    echo "✅ CORS configuration applied successfully!"
    echo ""
    echo "Verifying CORS configuration..."
    gsutil cors get gs://$BUCKET_NAME
else
    echo "❌ Failed to apply CORS configuration"
    echo "Make sure you have gsutil installed and authenticated"
    echo "Run: gcloud auth login"
fi

# Cleanup
rm /tmp/cors-config.json

echo ""
echo "📋 Next steps:"
echo "1. Make sure bucket is publicly readable:"
echo "   gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME"
echo ""
echo "2. Restart your dev server:"
echo "   npm run dev:all"
echo ""
echo "3. Clear browser cache and reload"

