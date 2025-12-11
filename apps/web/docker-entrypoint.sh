#!/bin/sh
# Generate runtime config from environment variables
cat > /usr/share/nginx/html/config.js << EOF
window.__RUNTIME_CONFIG__ = {
  API_URL: '${VITE_API_URL:-http://localhost:4001}'
};
EOF

# Make config.js readable by nginx
chmod 644 /usr/share/nginx/html/config.js

# Start nginx
exec nginx -g 'daemon off;'
