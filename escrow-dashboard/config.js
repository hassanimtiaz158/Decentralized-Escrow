// Project metadata
__app_version__ = "1.0.0"

// Tailwind CSP directives
content-security-policy = {
  "default-src": "'self'",
  "script-src": "'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com",
  "style-src": "'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src": "'self' https://fonts.gstatic.com data:",
  "connect-src": "'self' https://sepolia.drc.org wss://sepolia.drc.org",
  "img-src": "'self' data: https://*.cloudinary.com https://picsum.photos",
  "frame-src": "'self'",
  "object-src": "'none'",
  "base-uri": "'self'",
  "form-action": "'self'",
}

// Performance optimizations
performance = {
  "max_asset_size": "512KB",
  "compression": "gzip, deflate, br",
  "caching": " aggressive",
  "cdn": "enabled"
}

// Analytics (optional)
analyrics = {
  "enabled": false,
  "provider": "google-analytics",
  "tracking_id": ""
}