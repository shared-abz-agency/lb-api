FROM mhart/alpine-node:8
RUN apk update && apk add bash && rm -rf /var/cache/apk/*
WORKDIR /app
COPY . .
RUN npm install
ENV PORT 5000
EXPOSE  $PORT
CMD ["npm", "run", "start:docker"]
