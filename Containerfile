
from node:25-alpine as builder
ADD package.json package.json
ADD config/secret/key.pem config/secret/key.pem
ADD config/secret/cert.pem config/secret/cert.pem
ADD tsconfig.json tsconfig.json
RUN npm install
CMD npm run-script serve


