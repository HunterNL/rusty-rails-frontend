serve:
	#./node_modules/.bin/esbuild ./src/app.ts --bundle --sourcemap --format=esm --platform=browser --outfile=public/app.js --keyfile=config/secret/key.pem --certfile=config/secret/cert.pem --watch --serve=127.0.0.1:3000 --servedir=public
	./node_modules/.bin/esbuild ./src/app.ts --bundle --sourcemap --format=esm --platform=browser --outfile=public/generated/app.js --keyfile=config/secret/key.pem --certfile=config/secret/cert.pem --watch --serve=127.0.0.1:3000 --servedir=public --define:DEFINE_PRODUCTION=false --define:DEFINE_API_HOST=\"https://api.dev.localhost/\" --define:DEFINE_CLIENT_DEBUG=true

