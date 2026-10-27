FROM bsap-polza-api:latest
USER root
RUN apk add --no-cache ffmpeg
WORKDIR /app
ENTRYPOINT ["node"]