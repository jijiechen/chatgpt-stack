FROM node:20.16.0-slim
COPY . /app
WORKDIR /app
RUN npm install
ENTRYPOINT ["node", "/app/app.js"]
