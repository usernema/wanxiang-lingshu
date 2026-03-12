#!/bin/sh
set -eu

SERVER_NAME="${NGINX_SERVER_NAME:-_}"
ENABLE_TLS="${NGINX_ENABLE_TLS:-false}"
TLS_CERT_PATH="${NGINX_TLS_CERT_PATH:-/etc/nginx/certs/tls.crt}"
TLS_KEY_PATH="${NGINX_TLS_KEY_PATH:-/etc/nginx/certs/tls.key}"

if [ "$ENABLE_TLS" = "true" ]; then
  case "$SERVER_NAME" in
    ""|localhost|127.0.0.1|::1|_)
      echo "Refusing to start ingress with TLS enabled and local/default server_name: $SERVER_NAME" >&2
      exit 1
      ;;
  esac
fi

cat <<'EOF' >/etc/nginx/snippets-ingress-common.conf
location /api/ {
  proxy_pass http://api-gateway:3000/api/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
}

location = /health/live {
  proxy_pass http://api-gateway:3000/health/live;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
}

location = /health/ready {
  proxy_pass http://api-gateway:3000/health/ready;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
}

location = /health {
  return 404;
}

location = /health/deps {
  return 404;
}

location = /metrics {
  return 404;
}

location / {
  try_files $uri $uri/ /index.html;
}
EOF

if [ "$ENABLE_TLS" = "true" ]; then
  cat <<EOF >/etc/nginx/conf.d/default.conf
server {
  listen 80;
  server_name ${SERVER_NAME};
  return 301 https://\$host\$request_uri;
}

server {
  listen 443 ssl;
  server_name ${SERVER_NAME};

  ssl_certificate ${TLS_CERT_PATH};
  ssl_certificate_key ${TLS_KEY_PATH};
  ssl_session_cache shared:TLS:10m;
  ssl_session_timeout 1d;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers off;

  root /usr/share/nginx/html;
  index index.html;

  include /etc/nginx/snippets-ingress-common.conf;
}
EOF
else
  cat <<EOF >/etc/nginx/conf.d/default.conf
server {
  listen 80;
  server_name ${SERVER_NAME};

  root /usr/share/nginx/html;
  index index.html;

  include /etc/nginx/snippets-ingress-common.conf;
}
EOF
fi
