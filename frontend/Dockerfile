FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_APP_MODE=production
ARG VITE_ADMIN_HOSTNAME=
ENV VITE_APP_MODE=${VITE_APP_MODE}
ENV VITE_ADMIN_HOSTNAME=${VITE_ADMIN_HOSTNAME}
RUN npm run build

FROM nginx:1.27-alpine
COPY docker-entrypoint.sh /docker-entrypoint.d/40-generate-ingress.sh
RUN chmod +x /docker-entrypoint.d/40-generate-ingress.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
EXPOSE 443
