FROM alpine
RUN apk add --update nodejs npm
WORKDIR /usr/src/app
EXPOSE 3000
COPY src/ .
RUN ls -la /usr/src/app/*
RUN npm install pm2 -g
RUN npm install express mongoose amqplib axios
CMD [ "pm2-runtime", "app.js", "--watch"  ]