#!/bin/sh
set -eu

SERVER_NAME="${NGINX_SERVER_NAME:-_}"
SERVER_ALIASES="${NGINX_SERVER_ALIASES:-}"
ADMIN_SERVER_NAME="${NGINX_ADMIN_SERVER_NAME:-}"
ENABLE_TLS="${NGINX_ENABLE_TLS:-false}"
TLS_CERT_PATH="${NGINX_TLS_CERT_PATH:-/etc/nginx/certs/tls.crt}"
TLS_KEY_PATH="${NGINX_TLS_KEY_PATH:-/etc/nginx/certs/tls.key}"
API_RATE_LIMIT="${NGINX_API_RATE_LIMIT:-12r/s}"
API_BURST="${NGINX_API_BURST:-25}"
AUTH_RATE_LIMIT="${NGINX_AUTH_RATE_LIMIT:-10r/m}"
AUTH_BURST="${NGINX_AUTH_BURST:-5}"
CONN_LIMIT_PER_IP="${NGINX_CONN_LIMIT_PER_IP:-30}"
CLIENT_MAX_BODY_SIZE="${NGINX_CLIENT_MAX_BODY_SIZE:-2m}"
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

cat <<EOF >/etc/nginx/conf.d/00-security.conf
limit_req_status 429;
limit_conn_status 429;
limit_req_log_level warn;
limit_conn_log_level warn;
limit_req_zone \$binary_remote_addr zone=api_per_ip:10m rate=${API_RATE_LIMIT};
limit_req_zone \$binary_remote_addr zone=auth_per_ip:10m rate=${AUTH_RATE_LIMIT};
limit_conn_zone \$binary_remote_addr zone=conn_per_ip:10m;
server_tokens off;
client_max_body_size ${CLIENT_MAX_BODY_SIZE};
EOF

cat <<'EOF' >/etc/nginx/snippets-proxy-common.conf
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
EOF

cat <<EOF >/etc/nginx/snippets-ingress-common.conf
location = /api/v1/agents/register {
  limit_req zone=auth_per_ip burst=${AUTH_BURST} nodelay;
  limit_conn conn_per_ip ${CONN_LIMIT_PER_IP};
  include /etc/nginx/snippets-proxy-common.conf;
  proxy_pass http://api-gateway:3000/api/v1/agents/register;
}

location = /api/v1/agents/email/register/request-code {
  limit_req zone=auth_per_ip burst=${AUTH_BURST} nodelay;
  limit_conn conn_per_ip ${CONN_LIMIT_PER_IP};
  include /etc/nginx/snippets-proxy-common.conf;
  proxy_pass http://api-gateway:3000/api/v1/agents/email/register/request-code;
}

location = /api/v1/agents/email/register/complete {
  limit_req zone=auth_per_ip burst=${AUTH_BURST} nodelay;
  limit_conn conn_per_ip ${CONN_LIMIT_PER_IP};
  include /etc/nginx/snippets-proxy-common.conf;
  proxy_pass http://api-gateway:3000/api/v1/agents/email/register/complete;
}

location = /api/v1/agents/email/login/request-code {
  limit_req zone=auth_per_ip burst=${AUTH_BURST} nodelay;
  limit_conn conn_per_ip ${CONN_LIMIT_PER_IP};
  include /etc/nginx/snippets-proxy-common.conf;
  proxy_pass http://api-gateway:3000/api/v1/agents/email/login/request-code;
}

location = /api/v1/agents/email/login/complete {
  limit_req zone=auth_per_ip burst=${AUTH_BURST} nodelay;
  limit_conn conn_per_ip ${CONN_LIMIT_PER_IP};
  include /etc/nginx/snippets-proxy-common.conf;
  proxy_pass http://api-gateway:3000/api/v1/agents/email/login/complete;
}

location = /api/v1/agents/challenge {
  limit_req zone=auth_per_ip burst=${AUTH_BURST} nodelay;
  limit_conn conn_per_ip ${CONN_LIMIT_PER_IP};
  include /etc/nginx/snippets-proxy-common.conf;
  proxy_pass http://api-gateway:3000/api/v1/agents/challenge;
}

location = /api/v1/agents/login {
  limit_req zone=auth_per_ip burst=${AUTH_BURST} nodelay;
  limit_conn conn_per_ip ${CONN_LIMIT_PER_IP};
  include /etc/nginx/snippets-proxy-common.conf;
  proxy_pass http://api-gateway:3000/api/v1/agents/login;
}

location = /api/v1/agents/verify {
  limit_req zone=auth_per_ip burst=${AUTH_BURST} nodelay;
  limit_conn conn_per_ip ${CONN_LIMIT_PER_IP};
  include /etc/nginx/snippets-proxy-common.conf;
  proxy_pass http://api-gateway:3000/api/v1/agents/verify;
}

location /api/ {
  limit_req zone=api_per_ip burst=${API_BURST} nodelay;
  limit_conn conn_per_ip ${CONN_LIMIT_PER_IP};
  include /etc/nginx/snippets-proxy-common.conf;
  proxy_pass http://api-gateway:3000/api/;
}

location ^~ /assets/ {
  expires 7d;
  add_header Cache-Control "public, max-age=604800, immutable";
  try_files \$uri =404;
}

location = /favicon.ico {
  expires 1d;
  add_header Cache-Control "public, max-age=86400";
  try_files \$uri =404;
}

location = /robots.txt {
  expires 1d;
  add_header Cache-Control "public, max-age=86400";
  try_files \$uri =404;
}

location = /health/live {
  access_log off;
  include /etc/nginx/snippets-proxy-common.conf;
  proxy_pass http://api-gateway:3000/health/live;
}

location = /health/ready {
  access_log off;
  include /etc/nginx/snippets-proxy-common.conf;
  proxy_pass http://api-gateway:3000/health/ready;
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
