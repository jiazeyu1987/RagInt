FROM node:20-alpine AS build

WORKDIR /app/fronted

COPY fronted/package.json fronted/package-lock.json /app/fronted/
COPY fronted/vendor /app/fronted/vendor
RUN npm install --no-audit --no-fund

COPY fronted /app/fronted

ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

RUN npm run build


FROM nginx:alpine
COPY fronted/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/fronted/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
