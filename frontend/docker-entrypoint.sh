#!/bin/sh
set -eu

SERVER_NAME="${NGINX_SERVER_NAME:-_}"
SERVER_ALIASES="${NGINX_SERVER_ALIASES:-}"
ADMIN_SERVER_NAME="${NGINX_ADMIN_SERVER_NAME:-}"
ENABLE_TLS="${NGINX_ENABLE_TLS:-false}"
TLS_CERT_PATH="${NGINX_TLS_CERT_PATH:-/etc/nginx/certs/tls.crt}"
TLS_KEY_PATH="${NGINX_TLS_KEY_PATH:-/etc/nginx/certs/tls.key}"
PUBLIC_SERVER_NAMES="$(printf '%s %s' "$SERVER_NAME" "$SERVER_ALIASES" | tr -s ' ' | sed 's/^ //; s/ $//')"
EXTERNAL_SCHEME="http"

if [ "$ENABLE_TLS" = "true" ]; then
  EXTERNAL_SCHEME="https"
  case "$SERVER_NAME" in
    ""|localhost|127.0.0.1|::1|_)
      echo "Refusing to start ingress with TLS enabled and local/default server_name: $SERVER_NAME" >&2
      exit 1
      ;;
  esac

  if [ -n "$ADMIN_SERVER_NAME" ]; then
    case "$ADMIN_SERVER_NAME" in
      localhost|127.0.0.1|::1|_)
        echo "Refusing to start ingress with TLS enabled and local/default admin server_name: $ADMIN_SERVER_NAME" >&2
        exit 1
        ;;
    esac
  fi
fi

if [ -n "$ADMIN_SERVER_NAME" ] && [ "$ADMIN_SERVER_NAME" = "$SERVER_NAME" ]; then
  echo "Refusing to start ingress with identical public and admin hostnames: $SERVER_NAME" >&2
  exit 1
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
EOF

if [ -n "$ADMIN_SERVER_NAME" ]; then
  cat <<EOF >/etc/nginx/snippets-public-app.conf
location = /admin {
  return 308 ${EXTERNAL_SCHEME}://${ADMIN_SERVER_NAME}/;
}

location ^~ /admin/ {
  return 308 ${EXTERNAL_SCHEME}://${ADMIN_SERVER_NAME}\$request_uri;
}

location / {
  try_files \$uri \$uri/ /index.html;
}
EOF
else
  cat <<'EOF' >/etc/nginx/snippets-public-app.conf
location / {
  try_files $uri $uri/ /index.html;
}
EOF
fi

cat <<'EOF' >/etc/nginx/snippets-admin-app.conf
location / {
  try_files $uri $uri/ /index.html;
}
EOF

if [ "$ENABLE_TLS" = "true" ]; then
  cat <<EOF >/etc/nginx/conf.d/default.conf
server {
  listen 80;
  server_name ${PUBLIC_SERVER_NAMES};
  return 301 https://\$host\$request_uri;
}

server {
  listen 443 ssl;
  server_name ${PUBLIC_SERVER_NAMES};

  ssl_certificate ${TLS_CERT_PATH};
  ssl_certificate_key ${TLS_KEY_PATH};
  ssl_session_cache shared:TLS:10m;
  ssl_session_timeout 1d;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers off;

  root /usr/share/nginx/html;
  index index.html;

  include /etc/nginx/snippets-ingress-common.conf;
  include /etc/nginx/snippets-public-app.conf;
}
EOF

  if [ -n "$ADMIN_SERVER_NAME" ]; then
    cat <<EOF >>/etc/nginx/conf.d/default.conf

server {
  listen 80;
  server_name ${ADMIN_SERVER_NAME};
  return 301 https://\$host\$request_uri;
}

server {
  listen 443 ssl;
  server_name ${ADMIN_SERVER_NAME};

  ssl_certificate ${TLS_CERT_PATH};
  ssl_certificate_key ${TLS_KEY_PATH};
  ssl_session_cache shared:TLS:10m;
  ssl_session_timeout 1d;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers off;

  root /usr/share/nginx/html;
  index index.html;

  include /etc/nginx/snippets-ingress-common.conf;
  include /etc/nginx/snippets-admin-app.conf;
}
EOF
  fi
else
  cat <<EOF >/etc/nginx/conf.d/default.conf
server {
  listen 80;
  server_name ${PUBLIC_SERVER_NAMES};

  root /usr/share/nginx/html;
  index index.html;

  include /etc/nginx/snippets-ingress-common.conf;
  include /etc/nginx/snippets-public-app.conf;
}
EOF

  if [ -n "$ADMIN_SERVER_NAME" ]; then
    cat <<EOF >>/etc/nginx/conf.d/default.conf

server {
  listen 80;
  server_name ${ADMIN_SERVER_NAME};

  root /usr/share/nginx/html;
  index index.html;

  include /etc/nginx/snippets-ingress-common.conf;
  include /etc/nginx/snippets-admin-app.conf;
}
EOF
  fi
fi
