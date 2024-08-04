FROM node:20.16.0-slim
WORKDIR /app
COPY package.json /app/
COPY package-lock.json /app/
RUN npm install
COPY . /app
ENTRYPOINT ["node", "/app/app.js"]
