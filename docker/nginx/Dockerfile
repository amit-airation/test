FROM nginx:1.27-alpine

# Official image runs envsubst on /etc/nginx/templates/*.template
# → /etc/nginx/conf.d/ at container start.
COPY nginx.conf /etc/nginx/nginx.conf
COPY templates/ /etc/nginx/templates/

ENV API_UPSTREAM=api:3001 \
    WEB_UPSTREAM=web:3000 \
    UI_SERVER_NAME=test.amitverma01.dev \
    API_SERVER_NAME=api.test.amitverma01.dev

EXPOSE 80 443

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD nginx -t || exit 1
