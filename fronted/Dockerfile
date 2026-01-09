FROM node:20-alpine AS build

WORKDIR /app/fronted

COPY fronted/package.json /app/fronted/package.json
RUN npm install

COPY fronted /app/fronted

ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

RUN npm run build


FROM nginx:alpine
COPY --from=build /app/fronted/build /usr/share/nginx/html
EXPOSE 80

