FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_APP_MODE=leadership-demo
ARG VITE_DEMO_BANNER_LABEL=Leadership Demo
ARG VITE_DEMO_GATEWAY_LABEL=http://localhost:3300
ARG VITE_DEMO_RESET_SESSIONS_ON_LOAD=true
ENV VITE_APP_MODE=${VITE_APP_MODE}
ENV VITE_DEMO_BANNER_LABEL=${VITE_DEMO_BANNER_LABEL}
ENV VITE_DEMO_GATEWAY_LABEL=${VITE_DEMO_GATEWAY_LABEL}
ENV VITE_DEMO_RESET_SESSIONS_ON_LOAD=${VITE_DEMO_RESET_SESSIONS_ON_LOAD}
RUN npm run build

FROM nginx:1.27-alpine
COPY docker-entrypoint.sh /docker-entrypoint.d/40-generate-trial-ingress.sh
RUN chmod +x /docker-entrypoint.d/40-generate-trial-ingress.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
EXPOSE 443
