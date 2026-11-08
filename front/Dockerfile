# Frontend NeuroDash: build de Vite servido por nginx
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite incrusta estas variables en tiempo de build.
# VITE_API_BASE vacío => la UI usa el mock en memoria (src/mocks/mockApi.ts).
ARG VITE_API_BASE=http://localhost:8090
ARG VITE_ACTOR_ID=
ARG VITE_ACTOR_ROLE=
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_ACTOR_ID=$VITE_ACTOR_ID \
    VITE_ACTOR_ROLE=$VITE_ACTOR_ROLE

RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
